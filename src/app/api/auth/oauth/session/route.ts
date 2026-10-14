import { NextResponse } from "next/server";
import { supabaseUrl } from "@/lib/supabase-url";
import { authMode, createProfile, setSupabaseSession } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { onSignup } from "@/lib/referral";
import { trialAdmissionOpen } from "@/lib/ai/budget";
import { logError } from "@/lib/server/errors";
import { clientIp, hit } from "@/lib/server/rate-limit";
import { codeLocked, codeMatches, recordBadCode, requiredCode } from "@/lib/access-code";

/**
 * Finishes a Google / Microsoft sign-in. The token is checked with the auth service first; existing accounts just sign in.
 * A NEW account goes through the same invite-code and trial-seat gates as email sign-up.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!hit(`oauth:${ip}`, 20, 10 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  if (authMode() !== "supabase") return NextResponse.json({ error: "Sign-in isn't configured on this server." }, { status: 403 });
  const { access_token, refresh_token, expires_in, code, ref } = (await req.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; code?: string; ref?: string };
  if (!access_token || !refresh_token) return NextResponse.json({ error: "Sign-in didn't finish. Try again." }, { status: 400 });
  const r = await fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${access_token}` } });
  if (!r.ok) return NextResponse.json({ error: "Sign-in didn't finish. Try again." }, { status: 401 });
  const u = await r.json() as { id: string; email?: string; email_confirmed_at?: string | null; user_metadata?: { full_name?: string; name?: string } };
  if (!u.email || !u.email_confirmed_at) return NextResponse.json({ error: "That account has no verified email, so we can't sign you in with it." }, { status: 403 });
  const store = getStore();
  const existing = await store.get("profiles", u.id, u.id);
  if (!existing) {
    if (requiredCode() !== null) {
      if (codeLocked(ip)) return NextResponse.json({ error: "Too many wrong codes from this connection. Try again in 30 minutes, or join the waitlist for an invite." }, { status: 429 });
      if (!codeMatches(code)) { recordBadCode(ip); return NextResponse.json({ error: "New accounts need an access code. Mila is invite-only for now.", needCode: true }, { status: 403 }); }
    }
    const seat = await trialAdmissionOpen();
    if (!seat.open) {
      await logError({ source: "api", level: "warn", message: "Trial admissions paused (oauth sign-up)", route: "POST /api/auth/oauth/session" });
      return NextResponse.json({ error: "Mila is full for free trials right now. You're still on the list, and we'll email you when a seat opens." }, { status: 503 });
    }
    const created = await createProfile({ id: u.id, email: u.email, full_name: u.user_metadata?.full_name || u.user_metadata?.name || u.email.split("@")[0] });
    await onSignup(created, ref, ip).catch(() => false);
  }
  await setSupabaseSession(access_token, refresh_token, Number(expires_in) || 3600);
  return NextResponse.json({ ok: true, onboarded: existing ? (existing as { onboarded?: boolean }).onboarded !== false : false });
}
