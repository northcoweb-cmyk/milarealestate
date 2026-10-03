import { getStore } from "../db/store";
import type { ApiUsage } from "../types";

export type ApiProvider = "zillapi" | "rapidapi" | "rentcast" | "google_places";
export const PHOTO_PROVIDERS = ["zillapi", "rapidapi"];

export const monthStartIso = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();

export interface TrackInput { userId: string; provider: ApiProvider | string; endpoint: string; success: boolean; estCostUsd?: number; units?: number; propertyId?: string | null; detail?: string | null }

/** One row per third-party call (including failed ones, which usually cost nothing). Never throws. */
export async function trackApi(i: TrackInput): Promise<void> {
  try {
    await getStore().insert("api_usage", i.userId, { provider: i.provider, endpoint: i.endpoint.slice(0, 80), success: i.success, est_cost_usd: +(i.estCostUsd ?? 0).toFixed(5), units: i.units ?? 0, property_id: i.propertyId ?? null, detail: i.detail ? i.detail.slice(0, 200) : null });
    globalCache = null;
  } catch (e) { console.warn("[mila] api usage not recorded", e instanceof Error ? e.message : e); }
}

export interface UsageCounts { photoApiRequests: number; photoEnrichments: number; listingApiRequests: number; googlePlacesRequests: number; failedCalls: number; estCostUsd: number }

export function summarize(rows: ApiUsage[], since = monthStartIso()): UsageCounts {
  const m = rows.filter((r) => r.created_at >= since);
  const photo = m.filter((r) => PHOTO_PROVIDERS.includes(r.provider));
  return {
    photoApiRequests: photo.length,
    photoEnrichments: photo.filter((r) => r.detail?.startsWith("attempt")).length,
    listingApiRequests: m.filter((r) => r.provider === "rentcast").length,
    googlePlacesRequests: m.filter((r) => r.provider === "google_places").length,
    failedCalls: m.filter((r) => !r.success).length,
    estCostUsd: +m.reduce((n, r) => n + r.est_cost_usd, 0).toFixed(4),
  };
}

export async function usageFor(userId: string): Promise<UsageCounts> { return summarize(await getStore().list("api_usage", userId)); }

let globalCache: { at: number; rows: ApiUsage[] } | null = null;
/** Provider units spent by ALL users this month (protects the free/paid credit pool from a runaway). 30s memo. */
export async function globalUnitsThisMonth(provider: string): Promise<number> {
  if (!globalCache || Date.now() - globalCache.at > 30_000) globalCache = { at: Date.now(), rows: await getStore().listAll("api_usage") };
  const since = monthStartIso();
  return globalCache.rows.filter((r) => r.provider === provider && r.created_at >= since).reduce((n, r) => n + r.units, 0) + 0;
}
export const resetUsageMemo = () => { globalCache = null; };
