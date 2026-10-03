import { HttpError } from "./route";

/**
 * Small in-memory fixed-window limiter. Per server instance (not global across Vercel lambdas), so it blunts
 * floods and runaway loops rather than guaranteeing exact quotas. Paid actions are still credit-checked.
 */
const buckets = new Map<string, { n: number; reset: number }>();

export function hit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    if (buckets.size > 20000) buckets.clear();
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  return ++b.n <= max;
}

/** Throws a friendly 429 when `key` has used up its allowance in the window. */
export function rateLimit(key: string, max: number, windowMs = 60_000) {
  if (!hit(key, max, windowMs)) throw new HttpError(429, "You're doing that a lot. Give it a minute and try again.");
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

export const resetRateLimits = () => buckets.clear();
