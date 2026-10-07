import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Mila is invite-only for now: making a new account needs the access code. Existing accounts sign in as usual, and waitlist
 * members get in through their personal invite link instead.
 *
 * Set SIGNUP_ACCESS_CODE in the environment to change it. Without it, production falls back to the launch code, and local
 * development has no gate at all so tests and demos keep working.
 */
const LAUNCH_CODE = "3725";

export function requiredCode(): string | null {
  const set = process.env.SIGNUP_ACCESS_CODE?.trim();
  if (set) return set;
  return process.env.NODE_ENV === "production" ? LAUNCH_CODE : null;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time comparison, so the code can't be guessed digit by digit from response timing. */
export function codeMatches(given: unknown): boolean {
  const need = requiredCode();
  if (need === null) return true;
  if (typeof given !== "string") return false;
  return timingSafeEqual(digest(given.trim()), digest(need));
}

// A short numeric code can be brute-forced, so wrong guesses are capped per visitor (by IP). Only the person guessing gets locked out.
type Bucket = { n: number; reset: number };
const perIp = new Map<string, Bucket>();
const IP_MAX = 6, IP_WINDOW = 30 * 60_000;

const live = (b: Bucket | undefined, now: number) => (b && b.reset > now ? b : undefined);

export function codeLocked(ip: string, now = Date.now()): boolean {
  return (live(perIp.get(ip), now)?.n ?? 0) >= IP_MAX;
}

export function recordBadCode(ip: string, now = Date.now()) {
  if (perIp.size > 5000) for (const [k, v] of perIp) if (v.reset <= now) perIp.delete(k);
  const b = live(perIp.get(ip), now) ?? { n: 0, reset: now + IP_WINDOW };
  b.n++; perIp.set(ip, b);
}

export const resetCodeLimits = () => perIp.clear();
