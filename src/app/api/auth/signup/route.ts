import { supabaseUrl } from "@/lib/supabase-url";
import { NextResponse } from "next/server";
import { AuthError, authMode, createProfile, localSignIn, setSupabaseSession } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { clientIp, hit } from "@/lib/server/rate-limit";
import { codeLocked, codeMatches, recordBadCode, requiredCode } from "@/lib/access-code";

export async function POST(req: Request) {
  if (!hit(`signup:${clientIp(req)}`, 10, 10 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  const { email, name, password, code } = (await req.json().catch(() => ({}))) as { email?: string; name?: string; password?: string; code?: string };
  const ip = clientIp(req);
  if (requiredCode() !== null) {
    if (codeLocked(ip)) return NextResponse.json({ error: "Too many wrong codes. Try again later, or join the waitlist for an invite." }, { status: 429 });
    if (!codeMatches(code)) { recordBadCode(ip); return NextResponse.json({ error: "That access code isn't right. Mila is invite-only for now." }, { status: 403 }); }
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (typeof name !== "string" || !name.trim() || name.length > 120) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  try {
    if (authMode() === "supabase") {
      if (!password || password.length < 8) return NextResponse.json({ error: "Use a password of at least 8 characters." }, { status: 400 });
      // Accounts are created by the server only (after the code check), never straight from a browser.
      const base = supabaseUrl(), anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const created = await fetch(`${base}/auth/v1/admin/users`, { method: "POST", headers: { apikey: svc, Authorization: `Bearer ${svc}`, "content-type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: name } }) });
      const u = await created.json().catch(() => ({}));
      if (!created.ok) {
        const exists = created.status === 422 || /already|registered|exists/i.test(String(u?.msg ?? u?.message ?? u?.error_code ?? ""));
        return NextResponse.json({ error: exists ? "You already have a Mila account with this email. Sign in instead." : "Couldn't create your account." }, { status: exists ? 409 : 400 });
      }
      await createProfile({ id: u.id, email, full_name: name });
      const r = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const d = await r.json();
      if (!r.ok) return NextResponse.json({ error: "Your account was created. Sign in with your email and password." }, { status: 400 });
      await setSupabaseSession(d.access_token, d.refresh_token, d.expires_in);
      return NextResponse.json({ ok: true });
    }
    const { profile } = await localSignIn(email, name);
    void getStore;
    return NextResponse.json({ ok: true, onboarded: profile.onboarded });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AuthError ? e.message : "Couldn't sign you up." }, { status: e instanceof AuthError ? e.status : 400 });
  }
}
