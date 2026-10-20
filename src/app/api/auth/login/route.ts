import { supabaseUrl } from "@/lib/supabase-url";
import { NextResponse } from "next/server";
import { authMode, createProfile, localAuthAllowed, setLocalSession, setSupabaseSession } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { clientIp, hit } from "@/lib/server/rate-limit";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!hit(`login:${clientIp(req)}`, 20, 10 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  if (!email || typeof email !== "string" || email.length > 254) return NextResponse.json({ error: "Enter your email." }, { status: 400 });
  if (authMode() === "supabase") {
    const base = supabaseUrl(), anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const r = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15_000) }).catch(() => null);
    // a wrong password is a 400/401; anything else (no answer, 5xx, paused project, bad key) is OUR problem and must not read as "wrong password"
    if (!r || ![200, 400, 401, 422].includes(r.status)) {
      const { logError } = await import("@/lib/server/errors");
      await logError({ source: "api", level: "error", message: `Sign-in: the auth service ${r ? `answered HTTP ${r.status}` : "did not answer"}. Check the Supabase project is running and the keys are current.`, route: "POST /api/auth/login" });
      return NextResponse.json({ error: "Sign-in is having a problem on our side, not with your password. Please try again in a minute." }, { status: 503 });
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const body = d as { error_code?: string; msg?: string; message?: string; error_description?: string; error?: string };
      const code = String(body.error_code ?? body.error ?? ""), text = String(body.msg ?? body.message ?? body.error_description ?? "");
      const why = `${code} ${text}`.toLowerCase();
      if (/email_not_confirmed|not confirmed/.test(why)) return NextResponse.json({ error: "Your email isn't confirmed yet. Open the confirmation email we sent, or use Forgot password to get a fresh link." }, { status: 401 });
      if (/invalid api key|apikey|no api key|invalid_api_key|jwt/.test(why)) {
        const { logError } = await import("@/lib/server/errors");
        await logError({ source: "api", level: "error", message: `Sign-in: Supabase rejected the app's key (${text.slice(0, 120)}). Update NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel and redeploy.`, route: "POST /api/auth/login" });
        return NextResponse.json({ error: "Sign-in is having a problem on our side, not with your password. Please try again in a minute." }, { status: 503 });
      }
      if (!/invalid_credentials|invalid login|invalid_grant/.test(why)) {
        const { logError } = await import("@/lib/server/errors");
        await logError({ source: "api", level: "warn", message: `Sign-in refused: HTTP ${r.status} ${why.slice(0, 160)}`, route: "POST /api/auth/login" });
      }
      return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
    }
    const store = getStore();
    if (!(await store.get("profiles", d.user.id, d.user.id))) await createProfile({ id: d.user.id, email: String(d.user.email || email), full_name: d.user.user_metadata?.full_name || email.split("@")[0] });
    await setSupabaseSession(d.access_token, d.refresh_token, d.expires_in);
    return NextResponse.json({ ok: true });
  }
  if (!localAuthAllowed()) return NextResponse.json({ error: "Sign-in isn't configured on this server." }, { status: 403 });
  const p = await getStore().findProfileByEmail(email);
  if (!p) return NextResponse.json({ error: "No account with that email yet. Create one to get started." }, { status: 404 });
  await setLocalSession(p.id);
  return NextResponse.json({ ok: true });
}
