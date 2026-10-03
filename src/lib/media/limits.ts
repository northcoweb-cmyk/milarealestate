import { getStore } from "../db/store";

/**
 * ONE place that decides how much each plan may use per calendar month. Change numbers here (or override with the
 * MILA_TIER_LIMITS env var, JSON like {"free":{"photoEnrichments":5}}) - no UI or route hardcodes a limit.
 */
export type Tier = "free" | "starter" | "pro";
export interface TierLimits {
  listingSearches: number; // RentCast "new listings" / property lookups
  photoEnrichments: number; // distinct homes we may spend paid photo-provider calls on
  savedListings: number; // NOT enforced yet - reserved
  aiMessages: number; // NOT enforced yet (credits already meter AI) - reserved
}

export const DEFAULT_TIER_LIMITS: Record<Tier, TierLimits> = {
  free: { listingSearches: 10, photoEnrichments: 10, savedListings: 10, aiMessages: 50 },
  starter: { listingSearches: 60, photoEnrichments: 60, savedListings: 50, aiMessages: 500 },
  pro: { listingSearches: 300, photoEnrichments: 300, savedListings: 500, aiMessages: 3000 },
};

/** Subscription plan_key (app_config.plans) -> tier. Unknown paid plans count as "starter" so nobody is silently locked out. */
export const PLAN_TIER: Record<string, Tier> = { starter: "starter", basic: "starter", pro: "pro", pro_plus: "pro", team: "pro" };

export function tierLimits(tier: Tier): TierLimits {
  let over: Partial<Record<Tier, Partial<TierLimits>>> = {};
  try { over = JSON.parse(process.env.MILA_TIER_LIMITS || "{}"); } catch { /* ignore bad JSON: defaults apply */ }
  return { ...DEFAULT_TIER_LIMITS[tier], ...(over[tier] ?? {}) };
}

export async function tierOf(userId: string): Promise<Tier> {
  const sub = (await getStore().list("subscriptions", userId))[0];
  if (!sub) return "free";
  if (sub.status === "dev") return "pro"; // billing not configured: everyone is a tester
  if (sub.status !== "active") return "free";
  return PLAN_TIER[sub.plan_key] ?? "starter";
}
