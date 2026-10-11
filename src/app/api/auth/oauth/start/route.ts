import { NextResponse } from "next/server";
import { supabaseUrl } from "@/lib/supabase-url";
import { authMode } from "@/lib/auth";

const PROVIDERS: Record<string, { provider: string; scopes: string }> = {
  google: { provider: "google", scopes: "email profile" },
  microsoft: { provider: "azure", scopes: "email openid profile" },
};

/** Starts "Continue with Google / Microsoft". Sign-in only: calendar and email access is still a separate, explicit connection in Settings. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const p = PROVIDERS[u.searchParams.get("provider") ?? ""];
  if (!p || authMode() !== "supabase") return NextResponse.redirect(new URL("/welcome?error=oauth", req.url));
  const q = new URLSearchParams({ provider: p.provider, scopes: p.scopes, redirect_to: new URL("/welcome/oauth", u.origin).toString() });
  return NextResponse.redirect(`${supabaseUrl()}/auth/v1/authorize?${q}`);
}
