import { supabaseUrl } from "@/lib/supabase-url";
import { NextResponse } from "next/server";
import { AuthError, authMode, createProfile, localSignIn, setSupabaseSession } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { clientIp, hit } from "@/lib/server/rate-limit";

export async function POST(req: Request) {
  if (!hit(`signup:${clientIp(req)}`, 10, 10 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  const { email, name, password } = (await req.json().catch(() => ({}))) as { email?: string; name?: string; password?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (typeof name !== "string" || !name.trim() || name.length > 120) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  try {
    if (authMode() === "supabase") {
      if (!password || password.length < 8) return NextResponse.json({ error: "Use a password of at least 8 characters." }, { status: 400 });
      const base = supabaseUrl(), anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const r = await fetch(`${base}/auth/v1/signup`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email, password, data: { full_name: name } }) });
      const d = await r.json();
      if (!r.ok) return NextResponse.json({ error: d.msg || d.error_description || "Couldn't create your account." }, { status: 400 });
      if (!d.access_token) return NextResponse.json({ confirm: true, message: "Check your email to confirm your account, then sign in." });
      await createProfile({ id: d.user.id, email, full_name: name });
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
