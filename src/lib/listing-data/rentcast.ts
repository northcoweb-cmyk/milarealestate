/**
 * RentCast (https://developers.rentcast.io) — per-request US property records, active sale listings and value estimates.
 * Auth: X-Api-Key. Set RENTCAST_API_KEY on the server. Without it every function reports "not configured" and the app falls back to
 * the web-search lookup, so nothing here is ever required.
 * RentCast returns NO photos; images come from Google Street View (see /api/places/streetview) or a listing link the agent gives us.
 */
const BASE = (process.env.RENTCAST_BASE_URL || "https://api.rentcast.io/v1").replace(/\/$/, ""); // override only for local testing against a mock
export const rentcastConfigured = () => Boolean(process.env.RENTCAST_API_KEY);

export class RentcastError extends Error { constructor(public code: "auth" | "limit" | "not_found" | "bad_request" | "network", message: string) { super(message); } }

export interface PropertyExtra {
  year_built: number | null; lot_sqft: number | null; property_type: string | null; last_sale_price: number | null; last_sale_date: string | null;
  est_value: number | null; est_low: number | null; est_high: number | null; days_on_market: number | null; listed_date: string | null; list_status: string | null;
  hoa_fee: number | null; tax_year: number | null; tax_amount: number | null; garage_spaces: number | null; pool: boolean | null; stories: number | null;
  listing_agent: string | null; listing_office: string | null; mls: string | null; lat: number | null; lng: number | null; subdivision: string | null;
}
export interface PropertySnapshot { found: boolean; address: string; city: string | null; state: string | null; zip: string | null; county: string | null; beds: number | null; baths: number | null; sqft: number | null; list_price: number | null; extra: PropertyExtra }
export interface ListingCard { id: string; address: string; city: string | null; state: string | null; zip: string | null; price: number | null; beds: number | null; baths: number | null; sqft: number | null; type: string | null; days_on_market: number | null; listed_date: string | null; lat: number | null; lng: number | null; mls: string | null; agent: string | null; office: string | null }

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const pos = (v: unknown) => { const x = n(v); return x != null && x > 0 ? x : null; };

async function rc<T = unknown>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) throw new RentcastError("auth", "RentCast isn't connected.");
  const qs = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  let res: Response;
  try { res = await fetch(`${BASE}${path}?${qs}`, { headers: { "X-Api-Key": key, accept: "application/json" }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new RentcastError("network", "RentCast didn't respond."); }
  if (res.status === 401 || res.status === 403) throw new RentcastError("auth", "RentCast rejected the API key.");
  if (res.status === 429) throw new RentcastError("limit", "RentCast request limit reached.");
  if (res.status === 404) throw new RentcastError("not_found", "Not found.");
  if (res.status === 400) throw new RentcastError("bad_request", "RentCast couldn't read that address.");
  if (!res.ok) throw new RentcastError("network", `RentCast error ${res.status}.`);
  return (await res.json()) as T;
}

const memo = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await run();
  if (memo.size > 500) memo.clear();
  memo.set(key, { at: Date.now(), v });
  return v;
}
export const clearRentcastCache = () => memo.clear();

const fullAddress = (street: string, p: { city?: string | null; state?: string | null; zip?: string | null }) => [street, p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

type Raw = Record<string, any>;
/** Everything RentCast knows about one address: the public record, the active listing (if any), and a value estimate — fetched in parallel. */
export async function lookupAddress(street: string, place: { city?: string | null; state?: string | null; zip?: string | null }): Promise<PropertySnapshot> {
  const address = fullAddress(street, place);
  return cached(`addr:${address.toLowerCase()}`, 6 * 3_600_000, async () => {
    const [rec, lst, avm] = await Promise.all([
      rc<Raw[]>("/properties", { address, limit: 1 }).catch((e) => { if (e instanceof RentcastError && e.code === "not_found") return [] as Raw[]; throw e; }),
      rc<Raw[]>("/listings/sale", { address, status: "Active", limit: 1 }).catch(() => [] as Raw[]),
      rc<Raw>("/avm/value", { address, compCount: 5 }).catch(() => ({} as Raw)),
    ]);
    const r: Raw = Array.isArray(rec) ? rec[0] ?? {} : {}, l: Raw = Array.isArray(lst) ? lst[0] ?? {} : {};
    const taxes: Raw = r.propertyTaxes && typeof r.propertyTaxes === "object" ? r.propertyTaxes : {};
    const taxYear = Object.keys(taxes).map(Number).filter(Boolean).sort().pop();
    const agent = l.listingAgent?.name ?? null;
    const extra: PropertyExtra = {
      year_built: pos(l.yearBuilt) ?? pos(r.yearBuilt), lot_sqft: pos(l.lotSize) ?? pos(r.lotSize), property_type: s(l.propertyType) ?? s(r.propertyType),
      last_sale_price: pos(r.lastSalePrice), last_sale_date: s(r.lastSaleDate), est_value: pos(avm.price), est_low: pos(avm.priceRangeLow), est_high: pos(avm.priceRangeHigh),
      days_on_market: n(l.daysOnMarket), listed_date: s(l.listedDate), list_status: s(l.status), hoa_fee: pos(l.hoa?.fee) ?? pos(r.hoa?.fee),
      tax_year: taxYear ?? null, tax_amount: taxYear ? pos(taxes[String(taxYear)]?.total) : null, garage_spaces: pos(r.features?.garageSpaces ?? r.garageSpaces),
      pool: typeof (r.features?.pool ?? r.pool) === "boolean" ? (r.features?.pool ?? r.pool) : null, stories: pos(r.features?.floorCount ?? r.floorCount),
      listing_agent: s(agent), listing_office: s(l.listingOffice?.name), mls: [s(l.mlsName), s(l.mlsNumber)].filter(Boolean).join(" #") || null,
      lat: n(l.latitude) ?? n(r.latitude), lng: n(l.longitude) ?? n(r.longitude), subdivision: s(r.subdivision),
    };
    const any = Object.keys(r).length || Object.keys(l).length;
    return {
      found: Boolean(any), address: s(l.addressLine1) ?? s(r.addressLine1) ?? street, city: s(l.city) ?? s(r.city), state: s(l.state) ?? s(r.state), zip: s(l.zipCode) ?? s(r.zipCode), county: s(r.county) ?? s(l.county),
      beds: n(l.bedrooms) ?? n(r.bedrooms), baths: n(l.bathrooms) ?? n(r.bathrooms), sqft: pos(l.squareFootage) ?? pos(r.squareFootage), list_price: pos(l.price), extra,
    };
  });
}

export interface NewListingsQuery { city?: string; state?: string; zip?: string; beds?: number; minPrice?: number; maxPrice?: number; propertyType?: string; days?: number; limit?: number }
const range = (lo?: number, hi?: number) => (lo || hi ? `${lo ?? "*"}:${hi ?? "*"}` : undefined);

/** The newest active listings for an area, newest first. */
export async function newListings(q: NewListingsQuery): Promise<ListingCard[]> {
  const days = Math.min(Math.max(q.days ?? 7, 1), 60), limit = Math.min(Math.max(q.limit ?? 7, 1), 20);
  const key = `new:${[q.city, q.state, q.zip, q.beds, q.minPrice, q.maxPrice, q.propertyType, days].join("|").toLowerCase()}`;
  const rows = await cached(key, 2 * 3_600_000, () => rc<Raw[]>("/listings/sale", {
    city: q.city, state: q.state, zipCode: q.zip, status: "Active", daysOld: `*:${days}`, bedrooms: q.beds ? `${q.beds}:*` : undefined, price: range(q.minPrice, q.maxPrice), propertyType: q.propertyType, limit: 50,
  }));
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => s(r.addressLine1) && pos(r.price))
    .sort((a, b) => String(b.listedDate ?? "").localeCompare(String(a.listedDate ?? "")))
    .slice(0, limit)
    .map((r) => ({
      id: String(r.id ?? r.formattedAddress), address: String(r.addressLine1), city: s(r.city), state: s(r.state), zip: s(r.zipCode), price: pos(r.price), beds: n(r.bedrooms), baths: n(r.bathrooms),
      sqft: pos(r.squareFootage), type: s(r.propertyType), days_on_market: n(r.daysOnMarket), listed_date: s(r.listedDate), lat: n(r.latitude), lng: n(r.longitude),
      mls: [s(r.mlsName), s(r.mlsNumber)].filter(Boolean).join(" #") || null, agent: s(r.listingAgent?.name), office: s(r.listingOffice?.name),
    }));
}
