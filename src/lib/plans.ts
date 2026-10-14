import type { AppConfig } from "./types";

/**
 * New paid users see ONE plan ($39 a month) plus the Team inquiry. Older plans stay in the config so existing subscribers keep
 * their entitlements, billing and Stripe subscriptions exactly as they are; they just aren't offered to anyone new.
 */
export const LEGACY_PLAN_KEYS = ["solo"] as const;
export const isLegacyPlan = (key: string) => (LEGACY_PLAN_KEYS as readonly string[]).includes(key);

export function visiblePlans(cfg: Pick<AppConfig, "plans">, currentKey?: string | null) {
  return cfg.plans.filter((p) => !isLegacyPlan(p.key) || p.key === currentKey);
}
