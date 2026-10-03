import { ProviderError, type MediaPhoto, type MediaQuery, type PhotoProvider, type ProviderPhotos } from "../types";
import { fullAddress, sameHome } from "../address";

/** The key may be saved under the name Zillapi's own docs use (ZILLOW_API_KEY) or ours; accept any. */
export const ZILLAPI_KEY_VARS = ["ZILLAPI_API_KEY", "ZILLAPI_KEY", "ZILLOW_API_KEY", "ZILLAPI_TOKEN"];
export const zillapiKeyVar = () => ZILLAPI_KEY_VARS.find((k) => (process.env[k] ?? "").trim());
export const zillapiKey = () => { const v = zillapiKeyVar(); return v ? process.env[v]!.trim() : ""; };
export const zillapiBase = () => process.env.ZILLAPI_BASE_URL || "https://api.zillapi.com/v1";
const BASE = () => process.env.ZILLAPI_BASE_URL || "https://api.zillapi.com/v1";
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function call(path: string, params?: Record<string, string>): Promise<unknown> {
  const key = zillapiKey();
  if (!key) throw new ProviderError("auth", "Photo provider isn't configured.");
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  let res: Response;
  try { res = await fetch(`${BASE()}${path}${qs}`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new ProviderError("network", "Photo provider didn't respond."); }
  if (res.status === 401 || res.status === 403) throw new ProviderError("auth", "Photo provider rejected the key.");
  if (res.status === 402) throw new ProviderError("credits", "Photo provider is out of credits.");
  if (res.status === 429) throw new ProviderError("rate", "Photo provider rate limit.");
  if (res.status === 404) throw new ProviderError("not_found", "Not found.");
  if (!res.ok) throw new ProviderError("network", `Photo provider error ${res.status}.`);
  try { return await res.json(); } catch { throw new ProviderError("bad_response", "Photo provider sent something unreadable."); }
}

/** Pick the smallest jpeg >= `min` px wide (so cards load fast), else the largest available. */
function pick(list: unknown, min: number): { url: string; width: number | null } | null {
  const a = (Array.isArray(list) ? list : []).map((x: any) => ({ url: str(x?.url), width: n(x?.width) })).filter((x): x is { url: string; width: number | null } => Boolean(x.url));
  if (!a.length) return null;
  a.sort((x, y) => (x.width ?? 0) - (y.width ?? 0));
  return a.find((x) => (x.width ?? 0) >= min) ?? a[a.length - 1];
}

export function parsePhotos(body: any): MediaPhoto[] {
  const rows: any[] = Array.isArray(body?.data) ? body.data : [];
  const out: MediaPhoto[] = [];
  for (const r of rows) {
    const jpeg = r?.mixedSources?.jpeg;
    const big = pick(jpeg, 1000), small = pick(jpeg, 360);
    const url = big?.url ?? str(r?.url);
    if (!url || !/^https:\/\//i.test(url)) continue;
    out.push({ url, thumbUrl: small && /^https:\/\//i.test(small.url) ? small.url : undefined, width: big?.width ?? null, height: null, caption: str(r?.caption), sortOrder: out.length });
    if (out.length >= 60) break;
  }
  return out;
}

export const zillapi: PhotoProvider = {
  key: "zillapi",
  configured: () => Boolean(zillapiKey()),
  unitCostUsd: Number(process.env.ZILLAPI_COST_PER_CREDIT) || 0.005, // $5 / 1,000 credits on the monthly plan
  async fetchPhotos(q: MediaQuery): Promise<ProviderPhotos> {
    const requests: ProviderPhotos["requests"] = [];
    let zpid = q.providerPropertyId?.trim() || "";
    if (!zpid) {
      if (!q.city || !q.state) throw new ProviderError("not_found", "Need city and state to match a home exactly.");
      const body: any = await call("/properties/by-address", { address: fullAddress(q) });
      requests.push({ endpoint: "properties/by-address", units: 3 });
      const d = body?.data, a = d?.address ?? {};
      zpid = String(d?.zpid ?? "");
      // never attach photos from a neighbour: the returned home must be the SAME home
      if (!zpid || !sameHome(q, { address: String(a.streetAddress ?? ""), city: str(a.city), state: str(a.state), zip: str(a.zipcode) })) throw Object.assign(new ProviderError("mismatch", zpid ? `Zillapi returned "${[a.streetAddress, a.city, a.state, a.zipcode].filter(Boolean).join(", ") || "no address"}" for "${fullAddress(q)}"` : "Zillapi returned no home"), { requests });
    }
    try {
      const body = await call(`/properties/${encodeURIComponent(zpid)}/photos`);
      requests.push({ endpoint: "properties/{zpid}/photos", units: 1 });
      return { providerPropertyId: zpid, photos: parsePhotos(body), requests };
    } catch (e) { throw Object.assign(e instanceof ProviderError ? e : new ProviderError("network", "Photo lookup failed."), { requests }); }
  },
};
