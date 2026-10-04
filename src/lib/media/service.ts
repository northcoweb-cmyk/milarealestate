import { getStore } from "../db/store";
import type { ListingMediaCache } from "../types";
import { NIL_USER } from "../server/errors";
import { isListingImageHost, proxiedImage } from "./proxy";
import { addressKey } from "./address";
import { tierLimits, tierOf } from "./limits";
import { activeProvider, providerName } from "./providers";
import { ProviderError, type ListingMedia, type MediaPhoto, type MediaQuery, type ProviderPhotos } from "./types";
import { logError } from "../server/errors";
import { globalUnitsThisMonth, trackApi, usageFor } from "./usage";

const DAY = 86_400_000;
const days = (env: string | undefined, d: number) => (Number(env) > 0 ? Number(env) : d) * DAY;
const OK_TTL = () => days(process.env.PHOTO_CACHE_DAYS, 30); // photo URLs for a home rarely change
const MISS_TTL = () => days(process.env.PHOTO_MISS_CACHE_DAYS, 7); // "no photos / no match": don't pay again for a week

// Short-lived in-process copy: repeat views are instant, and if the database tables are missing photos STILL work (just re-fetched per server instance).
const mem = new Map<string, { m: ListingMedia; exp: number }>();
const memCount = new Map<string, number>(); // enrichments per user per month, used when the usage table can't be read
const remember = (k: string, m: ListingMedia, ms: number) => { if (mem.size > 500) mem.clear(); mem.set(k, { m: { ...m, cached: true }, exp: Date.now() + Math.min(ms, 6 * 3_600_000) }); };

/** Last few outcomes in this server instance (no addresses): lets the owner's health check show what actually happened even when the database tables aren't there. */
const g = globalThis as unknown as { __photoTrail?: string[] };
export const photoTrail = (): string[] => (g.__photoTrail ??= []);
const note = (msg: string) => { const t = photoTrail(); t.unshift(`${new Date().toISOString().slice(11, 19)} ${msg}`); t.length = Math.min(t.length, 12); };

const MISS_RESET = "2026-10-04T07:37:00Z";
const inflight = new Map<string, Promise<ListingMedia>>();
const benchedUntil = new Map<string, number>(); // provider-wide (credits / auth / rate)
const benchReason = new Map<string, string>();
const failedUntil = new Map<string, number>(); // per home (network errors): short backoff, never cached

const empty = (q: MediaQuery, status: ListingMedia["photoStatus"], reason?: string, source = providerName()): ListingMedia => ({ reason, listingId: q.listingId ?? null, propertyId: q.propertyId ?? null, providerPropertyId: q.providerPropertyId ?? null, source, photos: [], photoCount: 0, photoStatus: status, fetchedAt: null, expiresAt: null, cached: false });
const realPhotos = (r: ListingMediaCache) => (r.status === "ok" ? r.photos_json : []).filter((p) => { try { return isListingImageHost(new URL(p.url).hostname); } catch { return false; } }); // anything cached before the host check (e.g. a map image) is ignored
const fromRow = (r: ListingMediaCache, q: MediaQuery): ListingMedia => ({ listingId: r.listing_id ?? q.listingId ?? null, propertyId: r.property_id ?? q.propertyId ?? null, providerPropertyId: r.provider_property_id, source: r.provider, photos: realPhotos(r), photoCount: realPhotos(r).length, photoStatus: realPhotos(r).length > 0 ? "ok" : "unavailable", fetchedAt: r.fetched_at, expiresAt: r.expires_at, cached: true });

/** Strongest identifier first: provider id (ZPID) -> RentCast listing id -> exact normalized address. Never fuzzy. */
async function findCached(provider: string, q: MediaQuery, key: string): Promise<ListingMediaCache | null> {
  try { return await findCachedRaw(provider, q, key); } catch (e) { console.warn("[mila] photo cache unreadable (run migration 0004?)", e instanceof Error ? e.message : e); return null; }
}
async function findCachedRaw(provider: string, q: MediaQuery, key: string): Promise<ListingMediaCache | null> {
  const s = getStore();
  if (q.providerPropertyId) { const r = await s.findBy("listing_media_cache", NIL_USER, { provider, provider_property_id: q.providerPropertyId }); if (r) return r; }
  if (q.listingId) { const r = await s.findBy("listing_media_cache", NIL_USER, { provider, listing_id: q.listingId }); if (r && (!r.normalized_address || r.normalized_address === key)) return r; }
  return s.findBy("listing_media_cache", NIL_USER, { provider, normalized_address: key });
}

/** Cache only - never calls a provider. Used to render cards instantly. */
export async function peekMedia(q: MediaQuery): Promise<ListingMedia | null> {
  const p = providerName();
  const r = await findCached(p, q, addressKey(q));
  return r ? fromRow(r, q) : null;
}

async function save(provider: string, key: string, q: MediaQuery, photos: MediaPhoto[], providerPropertyId: string | null, ok: boolean, missTtl = MISS_TTL()) {
  const s = getStore();
  const now = Date.now();
  const row = {
    provider, normalized_address: key, listing_id: q.listingId ?? null, property_id: q.propertyId ?? null, provider_property_id: providerPropertyId,
    photos_json: ok ? photos : [], photo_count: ok ? photos.length : 0, status: (ok && photos.length ? "ok" : "unavailable") as "ok" | "unavailable",
    fetched_at: new Date(now).toISOString(), expires_at: new Date(now + (ok && photos.length ? OK_TTL() : missTtl)).toISOString(),
  };
  try {
    const ex = await s.findBy("listing_media_cache", NIL_USER, { provider, normalized_address: key });
    if (ex) await s.update("listing_media_cache", NIL_USER, ex.id, row);
    else await s.insert("listing_media_cache", NIL_USER, row);
  } catch (e) { console.warn("[mila] media cache not saved", e instanceof Error ? e.message : e); } // another instance won the race: fine
  return row;
}

/**
 * Photos for a home. Cache first; provider only when `fetch` is true, the home isn't cached, the plan has allowance left and the shared
 * budget isn't spent. NEVER throws: the listing keeps working with photoStatus "unavailable" / "limited".
 */
export async function getListingMedia(userId: string, q: MediaQuery, o: { fetch: boolean }): Promise<ListingMedia> {
  const m = await lookupMedia(userId, q, o);
  if (o.fetch) note(`${m.photoStatus}${m.reason ? ` (${m.reason})` : ""}${m.cached ? " cached" : ""} photos=${m.photoCount}`);
  return m;
}

async function lookupMedia(userId: string, q: MediaQuery, o: { fetch: boolean }): Promise<ListingMedia> {
  const name = providerName(), key = addressKey(q), flight = `${name}|${key}`;
  try {
    const m = mem.get(flight);
    if (m && m.exp > Date.now()) return m.m;
    const hit = await findCached(name, q, key);
    // misses recorded before the matching fixes (MISS_RESET) are retried once; a 404 costs the provider nothing
    const staleMiss = hit?.status === "unavailable" && hit.fetched_at < MISS_RESET;
    if (hit && !staleMiss && (new Date(hit.expires_at).getTime() > Date.now() || !o.fetch)) return fromRow(hit, q);
    if (!o.fetch) return empty(q, "pending");
    const provider = activeProvider();
    if (!provider) return hit ? fromRow(hit, q) : empty(q, "unavailable", "no_key");
    const running = inflight.get(flight);
    if (running) return await running; // identical simultaneous requests share ONE provider call
    const job = enrich(userId, q, key, name).finally(() => inflight.delete(flight));
    inflight.set(flight, job);
    return await job;
  } catch (e) {
    console.warn("[mila] media lookup failed", e instanceof Error ? e.message : e);
    await logError({ source: "api", level: "warn", message: `Listing photos: lookup failed - ${e instanceof Error ? e.message : e}`.slice(0, 300), route: "listing-photos", userId });
    return empty(q, "unavailable", "error");
  }
}

const monthKey = (u: string) => `${u}|${new Date().toISOString().slice(0, 7)}`;

async function enrich(userId: string, q: MediaQuery, key: string, name: string): Promise<ListingMedia> {
  const provider = activeProvider()!;
  const now = Date.now(), flight = `${name}|${key}`;
  const benched = benchedUntil.get(name) ?? 0;
  if (benched > now) return empty(q, "unavailable", `provider_${benchReason.get(name) ?? "paused"}`);
  if ((failedUntil.get(flight) ?? 0) > now) return empty(q, "unavailable", "error");
  if (!q.city || !q.state) return empty(q, "unavailable", "needs_city_state"); // exact matching needs city + state: "123 Main St" alone could be anywhere
  // plan allowance + shared monthly budget (the provider's credit pool is finite). If the usage table can't be read, an in-process counter still enforces the allowance.
  let used = memCount.get(monthKey(userId)) ?? 0, limit = tierLimits("pro").photoEnrichments;
  try { limit = tierLimits(await tierOf(userId)).photoEnrichments; used = Math.max(used, (await usageFor(userId)).photoEnrichments); } catch { /* counted in memory */ }
  if (used >= limit) return empty(q, "limited", "limited");
  const budget = Number(process.env.PHOTO_MONTHLY_UNIT_BUDGET) || 0; // 0 = no shared cap
  if (budget && (await globalUnitsThisMonth(name).catch(() => 0)) >= budget) return empty(q, "unavailable", "budget");
  memCount.set(monthKey(userId), (memCount.get(monthKey(userId)) ?? 0) + 1);

  let res: ProviderPhotos | null = null, err: ProviderError | null = null, reqs: { endpoint: string; units: number }[] = [];
  try { res = await provider.fetchPhotos(q); reqs = res.requests; }
  catch (e) { note(`provider error ${e instanceof ProviderError ? e.code : "unknown"}`); err = e instanceof ProviderError ? e : new ProviderError("network", "Photo lookup failed."); reqs = (e as { requests?: typeof reqs }).requests ?? []; }

  if (!reqs.length) await trackApi({ userId, provider: name, endpoint: "photo-lookup", success: false, propertyId: q.propertyId, detail: `attempt:${err?.code ?? "none"}` });
  for (const [i, r] of reqs.entries()) {
    const last = i === reqs.length - 1;
    await trackApi({ userId, provider: name, endpoint: r.endpoint, success: last ? !err : true, units: r.units, estCostUsd: r.units * provider.unitCostUsd, propertyId: q.propertyId, detail: i === 0 ? `attempt${err ? `:${err.code}` : ""}` : err && last ? `fail:${err.code}` : null });
  }

  const out = (row: Awaited<ReturnType<typeof save>>, reason?: string): ListingMedia => ({ ...fromRow({ ...row, id: "", user_id: NIL_USER, created_at: "", updated_at: "" }, q), cached: false, reason });
  if (res) {
    const row = await save(name, key, q, res.photos, res.providerPropertyId, true);
    const m = out(row, res.photos.length ? undefined : "empty");
    remember(flight, m, res.photos.length ? OK_TTL() : MISS_TTL());
    return m;
  }
  // every failure is logged for the owner with the real reason (never shown to agents)
  await logError({ source: "api", level: "warn", message: `Listing photos (${name}) for ${q.address}, ${q.city}: ${err!.code} - ${err!.message}`.slice(0, 300), route: "listing-photos", userId });
  switch (err!.code) {
    case "not_found": case "mismatch": { const row = await save(name, key, q, [], null, false, err!.code === "mismatch" ? DAY : MISS_TTL()); const m = out(row, err!.code); remember(flight, m, DAY); return m; } // remember the miss
    case "credits": case "auth": benchedUntil.set(name, now + 3_600_000); benchReason.set(name, err!.code); break;
    case "rate": benchedUntil.set(name, now + 60_000); benchReason.set(name, "rate"); break;
    default: failedUntil.set(flight, now + 300_000);
  }
  return empty(q, "unavailable", `provider_${err!.code}`);
}

/** Listing photos already fetched for this home (cache only - never spends a provider call), as same-origin links ready for posts. */
export async function cachedListingPhotoUrls(q: MediaQuery, max = 8): Promise<string[]> {
  const m = await peekMedia(q).catch(() => null);
  return (m?.photos ?? []).slice(0, max).map((p) => proxiedImage(p.url)).filter(Boolean);
}

export const resetMediaMemo = () => { mem.clear(); memCount.clear(); benchReason.clear(); inflight.clear(); benchedUntil.clear(); failedUntil.clear(); };
