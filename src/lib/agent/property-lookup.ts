import { aiAvailable, estimateCost, getProvider } from "../ai/provider";
import { recordUsage } from "../credits";
import type { Property } from "../types";
import type { Ctx } from "./context";
import { CACHE_PREFIX } from "./memory";
import { findAddress } from "./nlu";

/**
 * Turning "123 Main Street" into a real, complete property:
 *  1. make sure we have the whole address (street + city/state or ZIP) — otherwise Mila asks;
 *  2. confirm it with Google's geocoder when a key is configured;
 *  3. look the home up on listing sites through the AI provider's web search and PREFILL beds/baths/sqft/price.
 * Looked-up facts are saved but stay "unconfirmed" until the agent ticks the box on the property page.
 */
const STATES: Record<string, string> = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };
const ABBR = new Set(Object.values(STATES));

export interface Place { city?: string | null; state?: string | null; zip?: string | null; county?: string | null; lat?: number | null; lng?: number | null; formatted?: string | null }

const STOP = new Set(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "pm", "am", "at", "on", "in", "the", "open", "house", "showing", "set", "up", "my", "a", "and", "for", "to", "it", "is", "its", "it's", "next", "this", "tomorrow", "today", "noon", "its"]);
/** The run of capitalised words right before a state, minus dates/times ("…Sunday at 2 PM Frederick" → "Frederick"). */
function cityBefore(s: string): string {
  const words = s.replace(/[,\s]+$/, "").split(/\s+/);
  const out: string[] = [];
  for (let k = words.length - 1; k >= 0; k--) { const w = words[k]; if (!/^[A-Z][A-Za-z.'-]*$/.test(w) || STOP.has(w.toLowerCase().replace(/\./g, ""))) break; out.unshift(w); }
  return out.slice(-3).join(" ");
}

/** City/state/ZIP written after (or near) the street address. Pure text parsing; no network. */
export function extractPlace(text: string): Place {
  const span = findAddress(text);
  let rest = span ? text.replace(span.raw, " | ") : text;
  rest = rest.replace(/\$\s*[\d,.]+\s*[km]?\b/gi, " ");
  const out: Place = {};
  const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(rest); if (zip) out.zip = zip[1];
  // "…, Gaithersburg, MD 20877" / "Gaithersburg MD" (abbreviations must be upper-case: "in", "or", "me" are words)
  const abbr = new RegExp(`(?:^|[\\s,|])(${[...ABBR].join("|")})(?=$|[\\s,.]|\\d)`, "g");
  for (const m of rest.matchAll(abbr)) {
    const city = cityBefore(rest.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0));
    if (city) { out.city = city; out.state = m[1]; break; }
    if (!out.state && out.zip) out.state = m[1];
  }
  if (!out.state) {
    const full = new RegExp(`\\b(${Object.keys(STATES).sort((a, b) => b.length - a.length).join("|")})\\b`, "i").exec(rest);
    if (full) { const city = cityBefore(rest.slice(Math.max(0, full.index - 60), full.index)); if (city || out.zip) { out.state = STATES[full[1].toLowerCase()]; if (city) out.city = city; } }
  }
  return out;
}

export interface Geo extends Place { exact: boolean; street: string }
type GeoJson = { status: string; results?: { formatted_address: string; partial_match?: boolean; types: string[]; address_components: { long_name: string; short_name: string; types: string[] }[]; geometry: { location: { lat: number; lng: number }; location_type: string } }[] };

async function geocodeOnce(key: string, q: string): Promise<GeoJson | null> {
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:US&key=${key}`, { signal: AbortSignal.timeout(6000) });
    return (await r.json()) as GeoJson;
  } catch { return null; }
}

/**
 * Google Geocoding: checks the address exists and fills city/state/ZIP/county. Lenient on purpose — new builds and rural
 * addresses often lack a street number in Google's data, and a real address must never be rejected for that.
 * Returns null when there is no key / Google can't answer, and "not_found" only when Google clearly knows no such place.
 */
export async function geocode(street: string, p: Place): Promise<Geo | "not_found" | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const queries = [
    [street, p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    ...(p.zip ? [`${street} ${p.zip}`] : []),
    ...(p.city || p.state ? [`${street} ${[p.city, p.state].filter(Boolean).join(" ")}`] : []),
  ];
  let sawZero = false;
  for (const q of [...new Set(queries)]) {
    const j = await geocodeOnce(key, q);
    if (!j) return null;
    if (j.status === "ZERO_RESULTS") { sawZero = true; continue; }
    if (j.status !== "OK" || !j.results?.length) return null; // key not enabled, quota, etc. — don't block the user
    const g = j.results[0];
    const c = (t: string) => g.address_components.find((x) => x.types.includes(t));
    const num = c("street_number")?.long_name, route = c("route")?.long_name;
    const city = c("locality")?.long_name ?? c("sublocality")?.long_name ?? c("postal_town")?.long_name ?? c("administrative_area_level_3")?.long_name ?? null;
    return {
      street: num && route ? `${num} ${route}` : street, city, state: c("administrative_area_level_1")?.short_name ?? null, zip: c("postal_code")?.long_name ?? null,
      county: c("administrative_area_level_2")?.long_name?.replace(/ County$/i, "") ?? null, lat: g.geometry.location.lat, lng: g.geometry.location.lng, formatted: g.formatted_address,
      exact: !!num && !g.partial_match && ["ROOFTOP", "RANGE_INTERPOLATED"].includes(g.geometry.location_type),
    };
  }
  return sawZero ? "not_found" : null;
}

export type Resolve = { status: "ok"; place: Place; street: string; unverified?: boolean } | { status: "ask" };
/**
 * Does this text give a full address? Reuses what we already know about the property, then parses, then geocodes.
 * An address Google can't find is NOT refused — we carry on and flag it as unverified so the agent can double-check.
 */
export async function resolveAddress(ctx: Ctx, text: string, street: string): Promise<Resolve> {
  const known = (await ctx.store.list("properties", ctx.userId)).find((p) => p.address.toLowerCase() === street.toLowerCase() && p.city && p.state);
  if (known) return { status: "ok", street, place: { city: known.city, state: known.state, zip: known.zip, county: known.county } };
  const p = extractPlace(text);
  const complete = !!(p.state && p.city) || !!p.zip;
  if (!complete) return { status: "ask" };
  const g = await geocode(street, p);
  if (g === "not_found") return { status: "ok", street, place: p, unverified: true };
  if (g) return { status: "ok", street, place: { city: g.city ?? p.city, state: g.state ?? p.state, zip: g.zip ?? p.zip, county: g.county, lat: g.lat, lng: g.lng, formatted: g.formatted } };
  return { status: "ok", street, place: p };
}

// ------------------------------------------------------------------ listing facts via web search
export interface Facts { beds: number | null; baths: number | null; sqft: number | null; list_price: number | null; year_built: number | null; status: string | null; type: string | null }
export interface LookupMemory { at: string; found: boolean; facts: Facts | null; sources: { title: string; url: string }[]; note?: string }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export async function lookupListingFacts(ctx: Ctx, address: string, place: Place): Promise<{ ok: true; facts: Facts; sources: { title: string; url: string }[] } | { ok: false; reason: string }> {
  if (!aiAvailable()) return { ok: false, reason: "no_ai" };
  const full = [address, place.city, [place.state, place.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  try {
    const r = await getProvider().complete({
      tier: "research", maxTokens: 700, webSearch: true,
      system: `You look up a specific US home for a real-estate agent. Use web search on listing and property sites (Redfin, Zillow, Realtor.com, brokerage / MLS pages, county records) to find the facts for EXACTLY this address — not a neighbour, not a similar street. If you cannot find this exact address, say found:false. Never guess or fill values from memory. Reply with ONLY JSON: {"found":boolean,"beds":number|null,"baths":number|null,"sqft":number|null,"list_price":number|null,"year_built":number|null,"status":"for sale"|"sold"|"off market"|"unknown"|null,"type":string|null}. list_price is the current list price only if it is for sale; for sold or off-market homes use null.`,
      messages: [{ role: "user", content: `Address: ${full}` }],
    });
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: "property_lookup", creditKey: "property_lookup", tier: "research", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) + (r.extraCostUsd ?? 0) });
    ctx.usage.aiCalls++;
    const j = JSON.parse(/\{[\s\S]*\}/.exec(r.text)?.[0] ?? "{}") as Partial<Facts> & { found?: boolean };
    const sources = (r.citations ?? []).slice(0, 5);
    if (!j.found || !sources.length) return { ok: false, reason: "not_found" }; // no sources → no facts
    const facts: Facts = { beds: num(j.beds), baths: num(j.baths), sqft: num(j.sqft), list_price: num(j.list_price), year_built: num(j.year_built), status: j.status ?? null, type: j.type ?? null };
    if (!facts.beds && !facts.baths && !facts.sqft && !facts.list_price) return { ok: false, reason: "not_found" };
    return { ok: true, facts, sources };
  } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : "error" }; }
}

export const LOOKUP_KEY = (propertyId: string) => `${CACHE_PREFIX}property_lookup:${propertyId}`;

/**
 * Fill a property from the address: place fields (geocoder) and listing facts (web search). Only fills EMPTY fields,
 * leaves the property unconfirmed, and remembers what was tried so it isn't repeated (and costs credits) every visit.
 */
export async function enrichProperty(ctx: Ctx, prop: Property, opts: { place?: Place; force?: boolean } = {}): Promise<{ property: Property; memory: LookupMemory | null; skipped?: boolean }> {
  const mems = await ctx.store.list("memories", ctx.userId);
  const memKey = LOOKUP_KEY(prop.id);
  const prior = mems.find((m) => m.key === memKey);
  if (prior && !opts.force) { try { return { property: prop, memory: JSON.parse(prior.value) as LookupMemory, skipped: true }; } catch { /* retry */ } }
  let cur = prop;
  const place: Place = { city: cur.city, state: cur.state, zip: cur.zip, ...Object.fromEntries(Object.entries(opts.place ?? {}).filter(([, v]) => v != null)) };
  const fill: Partial<Property> = {};
  if (!cur.city && place.city) fill.city = place.city;
  if (!cur.state && place.state) fill.state = place.state;
  if (!cur.zip && place.zip) fill.zip = place.zip;
  if (!cur.county && place.county) fill.county = place.county;
  const lk = await lookupListingFacts(ctx, cur.address, place);
  let memory: LookupMemory;
  if (lk.ok) {
    const f = lk.facts;
    if (cur.beds == null && f.beds) fill.beds = f.beds;
    if (cur.baths == null && f.baths) fill.baths = f.baths;
    if (cur.sqft == null && f.sqft) fill.sqft = f.sqft;
    if (cur.list_price == null && f.list_price) fill.list_price = f.list_price;
    const tokens = cur.address.toLowerCase().split(/\s+/).slice(0, 2);
    if (!cur.listing_url) { const s = lk.sources.find((x) => tokens.every((t) => x.url.toLowerCase().includes(t.replace(/[^a-z0-9]/g, "")) || x.title.toLowerCase().includes(t))); if (s) fill.listing_url = s.url; }
    memory = { at: ctx.now.toISOString(), found: true, facts: f, sources: lk.sources };
  } else memory = { at: ctx.now.toISOString(), found: false, facts: null, sources: [], note: lk.reason };
  if (Object.keys(fill).length) cur = (await ctx.store.update("properties", ctx.userId, cur.id, { ...fill, verified: false } as never)) ?? cur;
  if (prior) await ctx.store.update("memories", ctx.userId, prior.id, { value: JSON.stringify(memory) });
  else await ctx.store.insert("memories", ctx.userId, { scope: "property", subject_id: cur.id, key: memKey, value: JSON.stringify(memory), source: "system", confidence: 0.6, pinned: false });
  return { property: cur, memory };
}

export const describeFacts = (f: Facts | null) => f ? [f.beds ? `${f.beds} bd` : null, f.baths ? `${f.baths} ba` : null, f.sqft ? `${f.sqft.toLocaleString("en-US")} sq ft` : null, f.list_price ? `$${f.list_price.toLocaleString("en-US")}` : null].filter(Boolean).join(" · ") : "";
export const hostOf = host;
