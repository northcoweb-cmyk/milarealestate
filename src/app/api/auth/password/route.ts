import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { authMode } from "@/lib/auth";
import { supabaseUrl } from "@/lib/supabase-url";

/** Change your password: the current one must be right first. Accounts that sign in with Google have no password to change. */
export const POST = api(async ({ profile, req }) => {
  rateLimit(`pw:${profile.id}`, 8, 60 * 60_000);
  if (authMode() !== "supabase") throw bad("Password changes aren't available here.");
  const b = await readJson<{ current?: unknown; next?: unknown }>(req);
  const current = typeof b.current === "string" ? b.current : "", next = typeof b.next === "string" ? b.next : "";
  if (!current) throw bad("Enter your current password.");
  if (next.length < 8) throw bad("Use a new password of at least 8 characters.");
  if (next.length > 200) throw bad("That password is too long.");
  if (next === current) throw bad("Choose a new password that's different from the current one.");
  const base = supabaseUrl(), anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = { apikey: svc, Authorization: `Bearer ${svc}`, "content-type": "application/json" };
  const u = await fetch(`${base}/auth/v1/admin/users/${profile.id}`, { headers: admin, signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { identities?: { provider: string }[] } | null;
  if (u && !(u.identities ?? []).some((i) => i.provider === "email")) throw bad("You sign in with Google, so there's no Mila password to change.");
  // the current password must be right: the same check as signing in
  const ok = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email: profile.email, password: current }), signal: AbortSignal.timeout(15000) }).then((r) => r.ok).catch(() => false);
  if (!ok) throw bad("Your current password isn't right.");
  const done = await fetch(`${base}/auth/v1/admin/users/${profile.id}`, { method: "PUT", headers: admin, body: JSON.stringify({ password: next }), signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!done || !done.ok) throw bad("We couldn't change it. Try again in a moment.");
  return { ok: true, message: "Password changed." };
});
