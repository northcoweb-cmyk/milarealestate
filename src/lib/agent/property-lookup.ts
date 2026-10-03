import { trackApi } from "../media/usage";
import { type PropertyExtra, lookupAddress, rentcastConfigured } from "../listing-data/rentcast";
import { aiAvailable, estimateCost, getProvider } from "../ai/provider";
import { recordUsage } from "../credits";
import type { Property } from "../types";
import type { Ctx } from "./context";
import { CACHE_PREFIX } from "./memory";
import { addrKey, findAddress } from "./nlu";

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
function cityBefore(s: string, lower = false): string {
  const words = s.replace(/[,\s]+$/, "").split(/\s+/);
  const out: string[] = [];
  const word = lower ? /^[a-z][a-z.'-]*$/ : /^[A-Z][A-Za-z.'-]*$/;
  for (let k = words.length - 1; k >= 0; k--) { const w = words[k]; if (!word.test(w) || STOP.has(w.toLowerCase().replace(/\./g, "")) || (lower && LOWER_STOP.has(w))) break; out.unshift(w); }
  return out.slice(-3).join(" ");
}
/** "FREDERICK" / "rockville" / "new york" → "Frederick" / "Rockville" / "New York" */
const nameCase = (c: string) => c.split(/\s+/).map((w) => (w.length > 1 && (w === w.toUpperCase() || w === w.toLowerCase()) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ");
const LOWER_STOP = new Set(["listing", "listed", "new", "just", "got", "add", "signed", "bed", "bath", "price", "asking", "with", "that", "from", "near", "off", "out", "of", "by", "if", "so", "do", "can", "you", "me", "i", "we", "please", "pls"]);
/** two-letter state codes that are also everyday words: only trusted when typed in capitals */
const AMBIGUOUS_ABBR = new Set(["in", "or", "me", "hi", "ok", "oh", "id", "al", "la", "ma", "pa", "de", "co", "mo", "ne", "ar", "ga", "ms", "ct"]);

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
  if (!out.state && !/[A-Z]/.test(rest.replace(/\|/g, ""))) {
    // a message typed entirely in lower case ("…12 oak st rockville md 3bd"): trust the state code when it is not also an everyday word
    const low = new RegExp(`(?:^|[\\s,|])(${[...ABBR].map((a) => a.toLowerCase()).filter((a) => !AMBIGUOUS_ABBR.has(a)).join("|")})(?=$|[\\s,.]|\\d)`, "g");
    for (const m of rest.matchAll(low)) {
      const city = cityBefore(rest.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0), true);
      if (city) { out.city = city; out.state = m[1].toUpperCase(); break; }
    }
  }
  if (!out.state) {
    const full = new RegExp(`\\b(${Object.keys(STATES).sort((a, b) => b.length - a.length).join("|")})\\b`, "i").exec(rest);
    if (full) { const city = cityBefore(rest.slice(Math.max(0, full.index - 60), full.index)); if (city || out.zip) { out.state = STATES[full[1].toLowerCase()]; if (city) out.city = city; } }
  }
  if (out.city) out.city = nameCase(out.city);
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

export type Resolve = { status: "ok"; place: Place; street: string; unverified?: boolean; assumed?: boolean } | { status: "ask" };
/**
 * Does this text give a full address? Reuses what we already know about the property, then parses, then geocodes.
 * An address Google can't find is NOT refused — we carry on and flag it as unverified so the agent can double-check.
 */
export async function resolveAddress(ctx: Ctx, text: string, street: string, opts: { answering?: boolean } = {}): Promise<Resolve> {
  const known = (await ctx.store.list("properties", ctx.userId)).find((p) => addrKey(p.address) === addrKey(street) && p.city && p.state);
  if (known) return { status: "ok", street, place: { city: known.city, state: known.state, zip: known.zip, county: known.county } };
  let p = extractPlace(text);
  // the agent's own state ("Rockville, MD" in their profile or "Montgomery County, MD" as their market) fills a state they didn't repeat
  const mine = homeOf(ctx.profile.location), market = homeOf(ctx.profile.primary_market);
  const homeState = mine.state ?? market.state ?? null;
  if (!p.city && !p.zip) {
    // the reply to "what city?" is the last thing in the message: "…1231 Main Street Gaithersburg", "gaithersburg md", "20877"
    const tail = opts.answering ? tailAnswer(text, street) : null;
    if (tail) p = { ...p, ...tail };
    else if (opts.answering && aiAvailable()) { const ai = await llmPlace(ctx, text, street); if (ai) p = { ...p, ...ai }; }
  }
  if (p.city && !p.state && !p.zip && homeState) p.state = homeState; // a city with no state is in the agent's own state
  const complete = !!(p.city) || !!p.zip;
  if (!complete) {
    // Agents list in their own market. If we know it, assume it (and say so) instead of quizzing them; they can correct it in one line.
    const city = mine.city && !/\bcounty\b/i.test(mine.city) ? mine : null;
    if (city?.city) return { status: "ok", street, place: { city: city.city, state: city.state ?? homeState ?? undefined, zip: undefined }, assumed: true };
    return { status: "ask" };
  }
  const g = await geocode(street, p);
  if (g === "not_found") return { status: "ok", street, place: p, unverified: true };
  if (g) return { status: "ok", street, place: { city: g.city ?? p.city, state: g.state ?? p.state, zip: g.zip ?? p.zip, county: g.county, lat: g.lat, lng: g.lng, formatted: g.formatted } };
  return { status: "ok", street, place: p };
}

/** The agent's own place from their profile: "Rockville, MD", "Rockville MD", or just "Rockville". */
function homeOf(loc: string | null | undefined): Place {
  const v = (loc ?? "").trim();
  if (!v) return {};
  const p = extractPlace(v);
  if (p.city || p.zip || p.state) return p;
  return /^[\p{L}][\p{L} .'-]{1,39}$/u.test(v) ? { city: v.replace(/\s+/g, " ").split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") } : {};
}
const TAIL_STOP = new Set(["at", "on", "in", "for", "the", "a", "an", "am", "pm", "to", "is", "it", "its", "it's", "yes", "no", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "today", "tomorrow", "tonight", "morning", "afternoon", "evening", "noon", "street", "st", "road", "rd", "avenue", "ave", "drive", "dr", "lane", "ln", "court", "ct", "way", "boulevard", "blvd", "place", "pl", "terrace", "circle", "trail"]);
/** "Gaithersburg", "gaithersburg md", "Gaithersburg, MD 20877" at the very end of the message → a place. */
function tailAnswer(text: string, street: string): Place | null {
  const span = findAddress(text);
  const after = span ? text.slice((text.toLowerCase().indexOf(span.raw.toLowerCase()) >= 0 ? text.toLowerCase().indexOf(span.raw.toLowerCase()) : 0) + span.raw.length) : text;
  void street;
  const zip = /\b(\d{5})(?:-\d{4})?\s*[.!?]*$/.exec(after);
  const words = after.replace(/[.!?]+$/, "").replace(/\b\d{5}(?:-\d{4})?\s*$/, "").split(/[\s,]+/).filter(Boolean);
  let state: string | undefined;
  const last = words[words.length - 1];
  if (last && /^[A-Za-z]{2}$/.test(last) && ABBR.has(last.toUpperCase()) && !TAIL_STOP.has(last.toLowerCase())) { state = last.toUpperCase(); words.pop(); }
  const city: string[] = [];
  while (words.length && city.length < 3) { const w = words[words.length - 1]; if (!/^[A-Za-z][A-Za-z.'-]*$/.test(w) || TAIL_STOP.has(w.toLowerCase())) break; city.unshift(words.pop()!); }
  if (!city.length && !zip) return null;
  const out: Place = {};
  if (city.length) out.city = city.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  if (state) out.state = state;
  if (zip) out.zip = zip[1];
  return out;
}

/** When the rules can't read the reply, let the model read it. Cheap, bounded, and never invents: it returns nothing unless the reply names a place. */
async function llmPlace(ctx: Ctx, text: string, street: string): Promise<Place | null> {
  try {
    const r = await getProvider().complete({
      tier: "fast", maxTokens: 120,
      system: "A real-estate agent was asked which US city/state (or ZIP) a street address is in. Extract the place from their reply (the last part of the message). Return only what the reply states; never guess. Use a 2-letter state code.",
      messages: [{ role: "user", content: `Address: ${street}\nMessage: ${text.slice(-300)}` }],
      jsonSchema: { name: "place", description: "The place named in the reply", schema: { type: "object", properties: { city: { type: "string" }, state: { type: "string" }, zip: { type: "string" } } } },
    });
    ctx.usage.aiCalls++;
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: "place_reading", creditKey: "chat_simple", creditsOverride: 0, tier: "fast", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) });
    const j = (r.json ?? {}) as { city?: string; state?: string; zip?: string };
    const out: Place = {};
    if (j.city && /^[\p{L}.' -]{2,40}$/u.test(j.city)) out.city = j.city.trim();
    if (j.state && ABBR.has(j.state.toUpperCase())) out.state = j.state.toUpperCase();
    if (j.zip && /^\d{5}$/.test(j.zip)) out.zip = j.zip;
    return out.city || out.zip ? out : null;
  } catch { return null; }
}

// ------------------------------------------------------------------ listing facts via web search
export interface Facts { beds: number | null; baths: number | null; sqft: number | null; list_price: number | null; year_built: number | null; status: string | null; type: string | null }
export interface LookupMemory { at: string; found: boolean; facts: Facts | null; sources: { title: string; url: string }[]; note?: string; extra?: PropertyExtra; full?: boolean }

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
export async function enrichProperty(ctx: Ctx, prop: Property, opts: { place?: Place; force?: boolean; full?: boolean } = {}): Promise<{ property: Property; memory: LookupMemory | null; skipped?: boolean }> {
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
  // 1) licensed property data when RentCast is connected: exact, structured, and cheap. 2) otherwise the web-search lookup.
  let rc: Awaited<ReturnType<typeof lookupAddress>> | null = null;
  if (rentcastConfigured()) {
    try {
      rc = await lookupAddress(cur.address, place, { full: opts.full });
      // cost = requests made × the per-request price of your RentCast plan (default: Foundation, $74 / 1,000 requests)
      await trackApi({ userId: ctx.userId, provider: "rentcast", endpoint: opts.full ? "property+listing+avm" : "properties", success: rc.found, units: rc.requests, estCostUsd: rc.requests * (Number(process.env.MILA_RENTCAST_COST_PER_REQUEST) || 0.074), propertyId: cur.id });
      await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: opts.full ? "property_prep" : "property_lookup", creditKey: opts.full ? "property_prep" : "property_lookup", provider: "rentcast", model: "property-data", estCostUsd: rc.requests * (Number(process.env.MILA_RENTCAST_COST_PER_REQUEST) || 0.074) });
    } catch (e) { console.warn("[mila] rentcast lookup failed", e instanceof Error ? e.message : e); }
  }
  const lk: Awaited<ReturnType<typeof lookupListingFacts>> = rc?.found
    ? { ok: true, facts: { beds: rc.beds, baths: rc.baths, sqft: rc.sqft, list_price: rc.list_price, year_built: rc.extra.year_built, status: rc.extra.list_status, type: rc.extra.property_type }, sources: [{ title: "Public records & listing data", url: "" }] }
    : await lookupListingFacts(ctx, cur.address, place);
  if (rc?.found) { // place fields the geocoder didn't give us
    if (!cur.city && rc.city) fill.city = rc.city; if (!cur.state && rc.state) fill.state = rc.state; if (!cur.zip && rc.zip) fill.zip = rc.zip; if (!cur.county && rc.county) fill.county = rc.county;
  }
  let memory: LookupMemory;
  if (lk.ok) {
    const f = lk.facts;
    if (cur.beds == null && f.beds) fill.beds = f.beds;
    if (cur.baths == null && f.baths) fill.baths = f.baths;
    if (cur.sqft == null && f.sqft) fill.sqft = f.sqft;
    if (cur.list_price == null && f.list_price) fill.list_price = f.list_price;
    const tokens = cur.address.toLowerCase().split(/\s+/).slice(0, 2);
    if (!cur.listing_url) { const s = lk.sources.find((x) => tokens.every((t) => x.url.toLowerCase().includes(t.replace(/[^a-z0-9]/g, "")) || x.title.toLowerCase().includes(t))); if (s) fill.listing_url = s.url; }
    memory = { at: ctx.now.toISOString(), found: true, facts: f, sources: lk.sources, ...(rc?.found ? { extra: rc.extra, full: Boolean(opts.full) } : {}) };
  } else memory = { at: ctx.now.toISOString(), found: false, facts: null, sources: [], note: lk.reason };
  if (Object.keys(fill).length) cur = (await ctx.store.update("properties", ctx.userId, cur.id, { ...fill, verified: Boolean(rc?.found) } as never)) ?? cur;
  if (prior) await ctx.store.update("memories", ctx.userId, prior.id, { value: JSON.stringify(memory) });
  else await ctx.store.insert("memories", ctx.userId, { scope: "property", subject_id: cur.id, key: memKey, value: JSON.stringify(memory), source: "system", confidence: 0.6, pinned: false });
  return { property: cur, memory };
}

export const describeFacts = (f: Facts | null) => f ? [f.beds ? `${f.beds} bd` : null, f.baths ? `${f.baths} ba` : null, f.sqft ? `${f.sqft.toLocaleString("en-US")} sq ft` : null, f.list_price ? `$${f.list_price.toLocaleString("en-US")}` : null].filter(Boolean).join(" · ") : "";
export const hostOf = host;
