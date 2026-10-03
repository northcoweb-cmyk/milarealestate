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
    const r = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    const d = await r.json();
    if (!r.ok) return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
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
