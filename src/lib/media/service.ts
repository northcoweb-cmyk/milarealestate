import { getStore } from "../db/store";
import type { ListingMediaCache } from "../types";
import { NIL_USER } from "../server/errors";
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

const inflight = new Map<string, Promise<ListingMedia>>();
const benchedUntil = new Map<string, number>(); // provider-wide (credits / auth / rate)
const failedUntil = new Map<string, number>(); // per home (network errors): short backoff, never cached

const empty = (q: MediaQuery, status: ListingMedia["photoStatus"], source = providerName()): ListingMedia => ({ listingId: q.listingId ?? null, propertyId: q.propertyId ?? null, providerPropertyId: q.providerPropertyId ?? null, source, photos: [], photoCount: 0, photoStatus: status, fetchedAt: null, expiresAt: null, cached: false });
const fromRow = (r: ListingMediaCache, q: MediaQuery): ListingMedia => ({ listingId: r.listing_id ?? q.listingId ?? null, propertyId: r.property_id ?? q.propertyId ?? null, providerPropertyId: r.provider_property_id, source: r.provider, photos: r.status === "ok" ? r.photos_json : [], photoCount: r.status === "ok" ? r.photo_count : 0, photoStatus: r.status === "ok" && r.photo_count > 0 ? "ok" : "unavailable", fetchedAt: r.fetched_at, expiresAt: r.expires_at, cached: true });

/** Strongest identifier first: provider id (ZPID) -> RentCast listing id -> exact normalized address. Never fuzzy. */
async function findCached(provider: string, q: MediaQuery, key: string): Promise<ListingMediaCache | null> {
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

async function save(provider: string, key: string, q: MediaQuery, photos: MediaPhoto[], providerPropertyId: string | null, ok: boolean) {
  const s = getStore();
  const now = Date.now();
  const row = {
    provider, normalized_address: key, listing_id: q.listingId ?? null, property_id: q.propertyId ?? null, provider_property_id: providerPropertyId,
    photos_json: ok ? photos : [], photo_count: ok ? photos.length : 0, status: (ok && photos.length ? "ok" : "unavailable") as "ok" | "unavailable",
    fetched_at: new Date(now).toISOString(), expires_at: new Date(now + (ok && photos.length ? OK_TTL() : MISS_TTL())).toISOString(),
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
  const name = providerName(), key = addressKey(q);
  try {
    const hit = await findCached(name, q, key);
    if (hit && (new Date(hit.expires_at).getTime() > Date.now() || !o.fetch)) return fromRow(hit, q);
    if (!o.fetch) return empty(q, "pending");
    const provider = activeProvider();
    if (!provider) return hit ? fromRow(hit, q) : empty(q, "unavailable");
    const flight = `${name}|${key}`;
    const running = inflight.get(flight);
    if (running) return await running; // identical simultaneous requests share ONE provider call
    const job = enrich(userId, q, key, name).finally(() => inflight.delete(flight));
    inflight.set(flight, job);
    return await job;
  } catch (e) {
    console.warn("[mila] media lookup failed", e instanceof Error ? e.message : e);
    await logError({ source: "api", level: "warn", message: `Listing photos: lookup failed - ${e instanceof Error ? e.message : e}`.slice(0, 300), route: "listing-photos", userId });
    return empty(q, "unavailable");
  }
}

async function enrich(userId: string, q: MediaQuery, key: string, name: string): Promise<ListingMedia> {
  const provider = activeProvider()!;
  const now = Date.now();
  if ((benchedUntil.get(name) ?? 0) > now || (failedUntil.get(`${name}|${key}`) ?? 0) > now) return empty(q, "unavailable");
  if (!q.city || !q.state) return empty(q, "unavailable"); // exact matching needs city + state: "123 Main St" alone could be anywhere
  // plan allowance + shared monthly budget (the provider's credit pool is finite)
  const limit = tierLimits(await tierOf(userId)).photoEnrichments;
  if ((await usageFor(userId)).photoEnrichments >= limit) return empty(q, "limited");
  const budget = Number(process.env.PHOTO_MONTHLY_UNIT_BUDGET) || 0; // 0 = no shared cap
  if (budget && (await globalUnitsThisMonth(name)) >= budget) return empty(q, "unavailable");

  let res: ProviderPhotos | null = null, err: ProviderError | null = null, reqs: { endpoint: string; units: number }[] = [];
  try { res = await provider.fetchPhotos(q); reqs = res.requests; }
  catch (e) { err = e instanceof ProviderError ? e : new ProviderError("network", "Photo lookup failed."); reqs = (e as { requests?: typeof reqs }).requests ?? []; }

  if (!reqs.length) await trackApi({ userId, provider: name, endpoint: "photo-lookup", success: false, propertyId: q.propertyId, detail: `attempt:${err?.code ?? "none"}` });
  for (const [i, r] of reqs.entries()) {
    const last = i === reqs.length - 1;
    await trackApi({ userId, provider: name, endpoint: r.endpoint, success: last ? !err : true, units: r.units, estCostUsd: r.units * provider.unitCostUsd, propertyId: q.propertyId, detail: i === 0 ? `attempt${err ? `:${err.code}` : ""}` : err && last ? `fail:${err.code}` : null });
  }

  if (res) {
    const row = await save(name, key, q, res.photos, res.providerPropertyId, true);
    return { ...fromRow({ ...row, id: "", user_id: NIL_USER, created_at: "", updated_at: "" }, q), cached: false };
  }
  if (!["not_found", "mismatch"].includes(err!.code)) await logError({ source: "api", level: "warn", message: `Listing photos (${name}): ${err!.code} - ${err!.message}`, route: "listing-photos", userId });
  switch (err!.code) {
    case "not_found": case "mismatch": { const row = await save(name, key, q, [], null, false); return { ...fromRow({ ...row, id: "", user_id: NIL_USER, created_at: "", updated_at: "" }, q), cached: false }; } // remember the miss
    case "credits": benchedUntil.set(name, now + 3_600_000); break;
    case "auth": benchedUntil.set(name, now + 3_600_000); break;
    case "rate": benchedUntil.set(name, now + 60_000); break;
    default: failedUntil.set(`${name}|${key}`, now + 300_000);
  }
  return empty(q, "unavailable");
}

export const resetMediaMemo = () => { inflight.clear(); benchedUntil.clear(); failedUntil.clear(); };
