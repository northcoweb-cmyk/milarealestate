import { supabaseUrl } from "./supabase-url";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { getStore, supabaseConfigured } from "./db/store";
import type { Profile } from "./types";
import { createProfile } from "./users";

/**
 * Authentication.
 *  - Supabase configured: real email+password auth via Supabase Auth; the
 *    access token lives in an httpOnly cookie and is verified server-side.
 *  - Otherwise (local dev): passwordless local accounts with an HMAC-signed
 *    cookie. This is blocked in production unless MILA_ALLOW_LOCAL_AUTH=1.
 */

const COOKIE = "mila_session";
const SB_COOKIE = "mila_sb_access";
const SB_REFRESH = "mila_sb_refresh";

export class AuthError extends Error {
  constructor(public status = 401, message = "Please sign in.") { super(message); }
}

export function authMode(): "supabase" | "local" {
  return supabaseConfigured() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "supabase" : "local";
}
export function localAuthAllowed() {
  return authMode() === "supabase" || process.env.NODE_ENV !== "production" || process.env.MILA_ALLOW_LOCAL_AUTH === "1";
}

function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const dir = process.env.MILA_DATA_DIR || path.join(process.cwd(), ".data");
  const f = path.join(dir, "session-secret");
  try {
    return fs.readFileSync(f, "utf8");
  } catch {
    fs.mkdirSync(dir, { recursive: true });
    const s = randomBytes(32).toString("hex");
    fs.writeFileSync(f, s, { mode: 0o600 });
    return s;
  }
}

const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");

function seal(userId: string) { return `${userId}.${sign(userId)}`; }
function unseal(v: string | undefined): string | null {
  if (!v) return null;
  const i = v.lastIndexOf(".");
  if (i < 0) return null;
  const id = v.slice(0, i), sig = v.slice(i + 1);
  const exp = sign(id);
  if (sig.length !== exp.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(exp)) ? id : null;
}

const cookieOpts = (maxAge = 60 * 60 * 24 * 60) => ({
  httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge,
});

export async function setLocalSession(userId: string) {
  (await cookies()).set(COOKIE, seal(userId), cookieOpts());
}
export async function setSupabaseSession(access: string, refresh: string, expiresIn: number) {
  const jar = await cookies();
  jar.set(SB_COOKIE, access, cookieOpts(expiresIn));
  jar.set(SB_REFRESH, refresh, cookieOpts(60 * 60 * 24 * 60));
}
export async function clearSession() {
  const jar = await cookies();
  for (const c of [COOKIE, SB_COOKIE, SB_REFRESH]) jar.delete(c);
}

const tokenCache = new Map<string, { id: string; exp: number }>();

async function supabaseUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SB_COOKIE)?.value;
  const base = supabaseUrl(), anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (token) {
    const hit = tokenCache.get(token);
    if (hit && hit.exp > Date.now()) return hit.id;
    const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const u = (await r.json()) as { id: string };
      tokenCache.set(token, { id: u.id, exp: Date.now() + 60_000 });
      return u.id;
    }
  }
  const refresh = jar.get(SB_REFRESH)?.value;
  if (refresh) {
    const r = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ refresh_token: refresh }),
    });
    if (r.ok) {
      const d = (await r.json()) as { access_token: string; refresh_token: string; expires_in: number; user: { id: string } };
      try { await setSupabaseSession(d.access_token, d.refresh_token, d.expires_in); } catch { /* read-only context (RSC) */ }
      return d.user.id;
    }
  }
  return null;
}

export async function getUserId(): Promise<string | null> {
  if (authMode() === "supabase") return supabaseUserId();
  return unseal((await cookies()).get(COOKIE)?.value);
}

export async function getProfile(): Promise<Profile | null> {
  const id = await getUserId();
  if (!id) return null;
  return getStore().get("profiles", id, id);
}

export async function requireProfile(): Promise<Profile> {
  const p = await getProfile();
  if (!p) throw new AuthError();
  return p;
}

export function isAdmin(p: Profile) {
  const list = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list.includes(p.email.toLowerCase());
  // Open-door fallback ONLY for a local, passwordless dev box. Never on a deployment (Vercel sets VERCEL for preview + production),
  // never in production, and never when real (Supabase) accounts exist: there, ADMIN_EMAILS must be set explicitly.
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL && authMode() === "local";
}

export async function localSignIn(email: string, name: string) {
  if (!localAuthAllowed()) throw new AuthError(403, "Local sign-in is disabled in production. Configure Supabase auth.");
  const store = getStore();
  const existing = await store.findProfileByEmail(email);
  const profile = existing ?? (await createProfile({ email, full_name: name || email.split("@")[0] }));
  await setLocalSession(profile.id);
  return { profile, created: !existing };
}

export { createProfile };
