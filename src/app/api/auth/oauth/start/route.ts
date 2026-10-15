import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseUrl } from "@/lib/supabase-url";
import { authMode } from "@/lib/auth";

/** Google sign-in runs on our own domain (the consent screen says app.milarealestate.app, never the backend host) when the Google client is set; otherwise it falls back to the auth service's hosted redirect. */
export const googleDirect = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Starts "Continue with Google". Sign-in only: calendar and email access is still a separate, explicit connection in Settings. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("provider") !== "google" || authMode() !== "supabase") return NextResponse.redirect(new URL("/welcome?error=oauth", req.url));
  if (!googleDirect()) {
    const q = new URLSearchParams({ provider: "google", scopes: "email profile", redirect_to: new URL("/welcome/oauth", u.origin).toString() });
    return NextResponse.redirect(`${supabaseUrl()}/auth/v1/authorize?${q}`);
  }
  const state = randomBytes(24).toString("hex");
  const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: new URL("/api/auth/oauth/google/callback", u.origin).toString(), response_type: "code", scope: "openid email profile", state, prompt: "select_account" });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  res.cookies.set("mila_oauth_state", state, { httpOnly: true, secure: u.protocol === "https:", sameSite: "lax", path: "/api/auth/oauth/google", maxAge: 600 });
  return res;
}
