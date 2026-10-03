import { ProviderError, type MediaPhoto, type MediaQuery, type PhotoProvider, type ProviderPhotos } from "../types";
import { fullAddress, sameHome } from "../address";

/**
 * OPTIONAL second provider ("US Real Estate" on RapidAPI). NOT live-verified: the response shapes below follow the public listing of
 * the API (photos, primary_photo, listing_id, property_id, permalink) and are parsed defensively, but run `npm run photo:probe`
 * with your own RAPIDAPI_KEY before turning it on. Host and paths are overridable because RapidAPI vendors rename them.
 */
const HOST = () => process.env.RAPIDAPI_HOST || "us-real-estate.p.rapidapi.com";
const SEARCH = () => process.env.RAPIDAPI_SEARCH_PATH || "/v2/for-sale";
const DETAIL = () => process.env.RAPIDAPI_DETAIL_PATH || "/v2/property-detail";
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function call(path: string, params: Record<string, string>): Promise<any> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new ProviderError("auth", "Photo provider isn't configured.");
  let res: Response;
  try { res = await fetch(`https://${HOST()}${path}?${new URLSearchParams(params)}`, { headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST(), accept: "application/json" }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new ProviderError("network", "Photo provider didn't respond."); }
  if (res.status === 401 || res.status === 403) throw new ProviderError("auth", "Photo provider rejected the key.");
  if (res.status === 429) throw new ProviderError("rate", "Photo provider rate limit.");
  if (res.status === 404) throw new ProviderError("not_found", "Not found.");
  if (!res.ok) throw new ProviderError("network", `Photo provider error ${res.status}.`);
  try { return await res.json(); } catch { throw new ProviderError("bad_response", "Photo provider sent something unreadable."); }
}

export function parseRapidPhotos(home: any): MediaPhoto[] {
  const raw: unknown[] = [...(Array.isArray(home?.photos) ? home.photos : []), ...(Array.isArray(home?.home?.photos) ? home.home.photos : [])];
  const first = home?.primary_photo?.href ?? home?.home?.primary_photo?.href;
  const urls = [first, ...raw.map((p: any) => (typeof p === "string" ? p : p?.href ?? p?.url))].filter((u): u is string => typeof u === "string" && /^https:\/\//i.test(u));
  return [...new Set(urls)].slice(0, 60).map((url, i) => ({ url, width: null, height: null, caption: null, sortOrder: i }));
}

export const rapidapi: PhotoProvider = {
  key: "rapidapi",
  configured: () => Boolean(process.env.RAPIDAPI_KEY),
  unitCostUsd: Number(process.env.RAPIDAPI_COST_PER_REQUEST) || 0.01,
  async fetchPhotos(q: MediaQuery): Promise<ProviderPhotos> {
    const requests: ProviderPhotos["requests"] = [];
    let id = q.providerPropertyId?.trim() || "";
    if (!id) {
      if (!q.city || !q.state) throw new ProviderError("not_found", "Need city and state to match a home exactly.");
      const body = await call(SEARCH(), { state_code: q.state.toUpperCase().slice(0, 2), city: q.city, location: fullAddress(q), limit: "10", offset: "0" });
      requests.push({ endpoint: "search", units: 1 });
      const rows: any[] = body?.data?.home_search?.results ?? body?.data?.results ?? [];
      const hit = rows.find((r) => sameHome(q, { address: str(r?.location?.address?.line) ?? "", city: str(r?.location?.address?.city), state: str(r?.location?.address?.state_code), zip: str(r?.location?.address?.postal_code) }));
      if (!hit) throw Object.assign(new ProviderError("mismatch", "No exact match."), { requests });
      id = String(hit.property_id ?? "");
      if (!id) throw Object.assign(new ProviderError("not_found", "No property id."), { requests });
      const fromSearch = parseRapidPhotos(hit);
      if (fromSearch.length > 1) return { providerPropertyId: id, photos: fromSearch, requests };
    }
    const body = await call(DETAIL(), { property_id: id });
    requests.push({ endpoint: "property-detail", units: 1 });
    return { providerPropertyId: id, photos: parseRapidPhotos(body?.data?.home ?? body?.data ?? body), requests };
  },
};
