import { NextResponse } from "next/server";
import { supabaseUrl } from "@/lib/supabase-url";
import { authMode } from "@/lib/auth";
import { logError } from "@/lib/server/errors";

const fail = (req: Request) => NextResponse.redirect(new URL("/welcome?error=oauth", req.url));

/** Google sent the person back to OUR domain. Swap the one-time code for Google's ID token, hand that to the auth service for a session, then finish on the same page the hosted flow uses. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code"), state = u.searchParams.get("state");
  const saved = /(?:^|;\s*)mila_oauth_state=([a-f0-9]+)/.exec(req.headers.get("cookie") ?? "")?.[1];
  if (authMode() !== "supabase" || !code || !state || !saved || state !== saved) return fail(req);
  try {
    const t = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: new URL("/api/auth/oauth/google/callback", u.origin).toString(), grant_type: "authorization_code" }) });
    const tj = await t.json().catch(() => ({})) as { id_token?: string };
    if (!t.ok || !tj.id_token) { await logError({ source: "api", level: "warn", message: "Google sign-in: code exchange failed", route: "GET /api/auth/oauth/google/callback" }); return fail(req); }
    const s = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=id_token`, { method: "POST", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "content-type": "application/json" }, body: JSON.stringify({ provider: "google", id_token: tj.id_token }) });
    const sj = await s.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!s.ok || !sj.access_token || !sj.refresh_token) { await logError({ source: "api", level: "warn", message: "Google sign-in: session exchange failed", route: "GET /api/auth/oauth/google/callback" }); return fail(req); }
    const hash = new URLSearchParams({ access_token: sj.access_token, refresh_token: sj.refresh_token, expires_in: String(sj.expires_in ?? 3600) });
    const res = NextResponse.redirect(new URL(`/welcome/oauth#${hash}`, u.origin));
    res.cookies.set("mila_oauth_state", "", { path: "/api/auth/oauth/google", maxAge: 0 });
    return res;
  } catch { return fail(req); }
}
