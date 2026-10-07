/**
 * Free and keyed public data about any US place, used by Mila's research tools. Everything fails soft: a source that is down, rate
 * limited or not configured is simply left out and named in `missing`, so the assistant can say what it could not check.
 *   - U.S. Census geocoder (free): exact coordinates, county and census tract for a street address
 *   - OpenStreetMap Nominatim (free): places and neighbourhoods without a street address, neighbourhood names
 *   - FEMA National Flood Hazard Layer (free): flood zone at a point
 *   - Census ACS (free key, CENSUS_API_KEY): tract median rent, household income, renter share, vacancy
 *   - Walk Score (key, WALKSCORE_API_KEY): walk, transit and bike scores
 */
const UA = `Mila/1.0 (${process.env.MILA_CONTACT_EMAIL || "admin@milarealestate.app"})`;
const memo = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await run();
  if (memo.size > 400) memo.clear();
  memo.set(key, { at: Date.now(), v });
  return v;
}
export const clearAreaCache = () => memo.clear();

async function getJson(url: string, ms = 9000, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA, ...headers }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res.json();
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export interface GeoResult { found: boolean; query: string; matched: string | null; lat: number | null; lng: number | null; state: string | null; county: string | null; stateFips: string | null; countyFips: string | null; tract: string | null; source: "census" | "osm" | null }

/** An address, building, neighbourhood or city name → coordinates and census geography. */
export async function geocode(query: string): Promise<GeoResult> {
  const q = query.trim().slice(0, 200);
  const none: GeoResult = { found: false, query: q, matched: null, lat: null, lng: null, state: null, county: null, stateFips: null, countyFips: null, tract: null, source: null };
  if (!q) return none;
  return cached(`geo:${q.toLowerCase()}`, 24 * 3_600_000, async () => {
    try {
      const d = await getJson(`https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);
      const m = d?.result?.addressMatches?.[0];
      if (m) {
        const g = m.geographies ?? {}; const county = g.Counties?.[0], tract = g["Census Tracts"]?.[0], st = g.States?.[0];
        return { found: true, query: q, matched: m.matchedAddress ?? null, lat: num(m.coordinates?.y), lng: num(m.coordinates?.x), state: st?.STUSAB ?? null, county: county?.NAME ?? null, stateFips: st?.STATE ?? county?.STATE ?? null, countyFips: county?.COUNTY ?? null, tract: tract?.GEOID ?? null, source: "census" as const };
      }
    } catch { /* fall through to OpenStreetMap */ }
    try {
      const d = await getJson(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=1&countrycodes=us`);
      const m = Array.isArray(d) ? d[0] : null;
      if (m) return { found: true, query: q, matched: m.display_name ?? null, lat: Number(m.lat) || null, lng: Number(m.lon) || null, state: m.address?.["ISO3166-2-lvl4"]?.replace(/^US-/, "") ?? null, county: m.address?.county ?? null, stateFips: null, countyFips: null, tract: null, source: "osm" as const };
    } catch { /* leave as not found */ }
    return none;
  });
}

/** Census geography (state, county, tract) for a point, for places found by name rather than street address. */
export async function geographyAt(lat: number, lng: number): Promise<Pick<GeoResult, "state" | "county" | "stateFips" | "countyFips" | "tract"> | null> {
  try {
    return await cached(`geoxy:${lat.toFixed(4)},${lng.toFixed(4)}`, 30 * 24 * 3_600_000, async () => {
      const d = await getJson(`https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);
      const g = d?.result?.geographies ?? {}; const county = g.Counties?.[0], tract = g["Census Tracts"]?.[0], st = g.States?.[0];
      return tract ? { state: st?.STUSAB ?? null, county: county?.NAME ?? null, stateFips: st?.STATE ?? county?.STATE ?? null, countyFips: county?.COUNTY ?? null, tract: tract.GEOID ?? null } : null;
    });
  } catch { return null; }
}

export interface FloodInfo { zone: string | null; description: string | null; high_risk: boolean | null }
/** FEMA flood zone at a point. A, AE, V… are high-risk zones (flood insurance is usually required with a mortgage). */
export async function floodZone(lat: number, lng: number): Promise<FloodInfo | null> {
  try {
    return await cached(`flood:${lat.toFixed(4)},${lng.toFixed(4)}`, 7 * 24 * 3_600_000, async () => {
      const d = await getJson(`https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY&returnGeometry=false&f=json`, 12000);
      const a = d?.features?.[0]?.attributes;
      if (!a?.FLD_ZONE) return { zone: null, description: "No FEMA flood map covers this point", high_risk: null };
      const z = String(a.FLD_ZONE);
      return { zone: z, description: a.ZONE_SUBTY ? String(a.ZONE_SUBTY).toLowerCase() : null, high_risk: /^(A|V)/i.test(z) };
    });
  } catch { return null; }
}

export interface NeighborhoodName { neighborhood: string | null; suburb: string | null; city: string | null; county: string | null; state: string | null; display: string | null }
let lastOsm = 0;
/** The neighbourhood, city and county a point sits in (OpenStreetMap asks for no more than one request a second). */
export async function neighborhoodAt(lat: number, lng: number): Promise<NeighborhoodName | null> {
  try {
    return await cached(`osm:${lat.toFixed(4)},${lng.toFixed(4)}`, 7 * 24 * 3_600_000, async () => {
      const wait = lastOsm + 1100 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); lastOsm = Date.now();
      const d = await getJson(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=16&addressdetails=1`);
      const a = d?.address ?? {};
      return { neighborhood: a.neighbourhood ?? a.quarter ?? null, suburb: a.suburb ?? a.city_district ?? null, city: a.city ?? a.town ?? a.village ?? null, county: a.county ?? null, state: a.state ?? null, display: d?.display_name ?? null };
    });
  } catch { return null; }
}

export interface TractStats { name: string | null; median_gross_rent: number | null; median_household_income: number | null; renter_share_pct: number | null; vacancy_pct: number | null; vintage: string }
/** Census tract statistics (American Community Survey 5-year). Needs the free CENSUS_API_KEY. */
export async function tractStats(g: Pick<GeoResult, "stateFips" | "countyFips" | "tract">): Promise<TractStats | null> {
  const key = process.env.CENSUS_API_KEY; if (!key || !g.stateFips || !g.countyFips || !g.tract) return null;
  const tractCode = g.tract.slice(-6);
  try {
    return await cached(`acs:${g.tract}`, 30 * 24 * 3_600_000, async () => {
      const vars = "NAME,B25064_001E,B19013_001E,B25003_001E,B25003_003E,B25002_001E,B25002_003E";
      const d = await getJson(`https://api.census.gov/data/2023/acs/acs5?get=${vars}&for=tract:${tractCode}&in=state:${g.stateFips}&in=county:${g.countyFips}&key=${key}`);
      const r: string[] | undefined = d?.[1]; if (!r) return null;
      const f = (i: number) => { const v = Number(r[i]); return Number.isFinite(v) && v >= 0 ? v : null; };
      const occ = f(3), renters = f(4), units = f(5), vacant = f(6);
      return { name: r[0] ?? null, median_gross_rent: f(1), median_household_income: f(2), renter_share_pct: occ && renters != null ? Math.round((renters / occ) * 100) : null, vacancy_pct: units && vacant != null ? Math.round((vacant / units) * 100) : null, vintage: "ACS 2019-2023" };
    });
  } catch { return null; }
}

export interface WalkInfo { walk: number | null; walk_label: string | null; transit: number | null; bike: number | null }
/** Walk, transit and bike scores. Needs WALKSCORE_API_KEY (free for light use). */
export async function walkScore(address: string, lat: number, lng: number): Promise<WalkInfo | null> {
  const key = process.env.WALKSCORE_API_KEY; if (!key) return null;
  try {
    return await cached(`walk:${lat.toFixed(4)},${lng.toFixed(4)}`, 30 * 24 * 3_600_000, async () => {
      const d = await getJson(`https://api.walkscore.com/score?format=json&address=${encodeURIComponent(address)}&lat=${lat}&lon=${lng}&transit=1&bike=1&wsapikey=${encodeURIComponent(key)}`);
      if (d?.status !== 1) return null;
      return { walk: num(d.walkscore), walk_label: d.description ?? null, transit: num(d.transit?.score), bike: num(d.bike?.score) };
    });
  } catch { return null; }
}

export interface AreaFacts { location: GeoResult; neighborhood: NeighborhoodName | null; flood: FloodInfo | null; tract: TractStats | null; walk: WalkInfo | null; not_available: string[] }
/** Everything we can look up about a place. Names what could not be checked so the answer is honest about it. */
export async function areaFacts(where: string | { lat: number; lng: number; label?: string }): Promise<AreaFacts> {
  const location = typeof where === "string" ? await geocode(where) : { found: true, query: where.label ?? "", matched: where.label ?? null, lat: where.lat, lng: where.lng, state: null, county: null, stateFips: null, countyFips: null, tract: null, source: null } as GeoResult;
  const out: AreaFacts = { location, neighborhood: null, flood: null, tract: null, walk: null, not_available: [] };
  if (!location.found || location.lat == null || location.lng == null) { out.not_available.push("could not locate that place"); return out; }
  const { lat, lng } = location;
  if (!location.tract) Object.assign(location, (await geographyAt(lat, lng)) ?? {}); // a place found by name still has a census tract
  const [nb, fl, ts, wk] = await Promise.all([neighborhoodAt(lat, lng), floodZone(lat, lng), tractStats(location), walkScore(location.matched ?? location.query, lat, lng)]);
  Object.assign(out, { neighborhood: nb, flood: fl, tract: ts, walk: wk });
  if (!fl) out.not_available.push("flood zone");
  if (!process.env.CENSUS_API_KEY) out.not_available.push("census income and rent statistics (not connected)"); else if (!ts) out.not_available.push("census income and rent statistics");
  if (!process.env.WALKSCORE_API_KEY) out.not_available.push("Walk Score (not connected)"); else if (!wk) out.not_available.push("Walk Score");
  out.not_available.push("crime statistics and school ratings (use web search and cite the source)");
  return out;
}
