import { trialAdmissionOpen } from "@/lib/ai/budget";
import { NextResponse } from "next/server";
import { supabaseUrl } from "@/lib/supabase-url";
import { authMode, createProfile, localSignIn, setSupabaseSession } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { clientIp, hit } from "@/lib/server/rate-limit";
import { logError, NIL_USER } from "@/lib/server/errors";
import { inviteFor, markClaimed } from "@/lib/waitlist";

/** Launch day: a waitlist member opens their emailed link, picks a password, and gets an account on the email they signed up with. */
export async function POST(req: Request) {
  if (!hit(`claim:${clientIp(req)}`, 12, 10 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  const { token, password } = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  const inv = await inviteFor(token);
  if (!inv.ok) return NextResponse.json({ error: inv.reason === "used" ? "This link was already used. Sign in with your email and password." : inv.reason === "expired" ? "This link has expired. Write to support@milarealestate.app to your invite email and we'll send a new one." : "This link isn't valid. Check you opened the newest email from Mila." }, { status: 400 });
  const { entry } = inv;
  // a valid invite link is the owner's decision to let this person in (sent from Mila OS "Grant access" or a batch), so the launch cap does not block it here
  const seat = await trialAdmissionOpen();
  if (!seat.open) {
    await logError({ source: "api", level: "warn", message: `Trial admissions paused: ${seat.admitted} admitted trial users reserve $${seat.reservedUsd.toFixed(2)} of the $${seat.poolUsd.toFixed(2)} pool`, route: "POST /api/auth/claim" });
    return NextResponse.json({ error: "Mila is full for free trials right now. You keep your place on the list, and we'll email you when a seat opens." }, { status: 503 });
  }
  const name = (entry.name || entry.email.split("@")[0]).slice(0, 120);
  try {
    if (authMode() === "supabase") {
      if (typeof password !== "string" || password.length < 8 || password.length > 200) return NextResponse.json({ error: "Use a password of at least 8 characters." }, { status: 400 });
      const base = supabaseUrl(), anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const created = await fetch(`${base}/auth/v1/admin/users`, { method: "POST", headers: { apikey: svc, Authorization: `Bearer ${svc}`, "content-type": "application/json" }, body: JSON.stringify({ email: entry.email, password, email_confirm: true, user_metadata: { full_name: name } }) });
      const u = await created.json().catch(() => ({}));
      if (!created.ok) {
        const exists = created.status === 422 || /already|registered|exists/i.test(String(u?.msg ?? u?.message ?? u?.error_code ?? ""));
        return NextResponse.json({ error: exists ? "You already have a Mila account with this email. Sign in instead." : "Couldn't create your account. Please try again." }, { status: exists ? 409 : 400 });
      }
      await createProfile({ id: u.id, email: entry.email, full_name: name });
      const r = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email: entry.email, password }) });
      const d = await r.json();
      if (!r.ok) return NextResponse.json({ error: "Your account was created. Sign in with your email and password." }, { status: 400 });
      await setSupabaseSession(d.access_token, d.refresh_token, d.expires_in);
      await markClaimed(entry, u.id);
      return NextResponse.json({ ok: true });
    }
    const { profile } = await localSignIn(entry.email, name); // local dev: passwordless
    void getStore;
    await markClaimed(entry, profile.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await logError({ source: "api", message: `Waitlist claim failed: ${e instanceof Error ? e.message : String(e)}`, route: "POST /api/auth/claim" });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
