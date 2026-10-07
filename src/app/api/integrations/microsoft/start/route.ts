import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { oauthStateSig } from "@/lib/integrations/oauth-state";
import { getUserId } from "@/lib/auth";
import { msAuthUrl, microsoftConfigured } from "@/lib/integrations/microsoft";
import { cookies } from "next/headers";

// Begins the OAuth flow. `state` is bound to the user via a signed, short-lived cookie (CSRF protection).
export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.redirect(new URL("/welcome", req.url));
  if (!microsoftConfigured()) return NextResponse.redirect(new URL("/settings/connections?error=not_configured", req.url));
  const nonce = randomBytes(16).toString("hex");
  const sig = oauthStateSig(nonce, uid);
  if (!sig) return NextResponse.redirect(new URL("/settings/connections?error=not_configured", req.url));
  (await cookies()).set("mila_oauth_ms", `${nonce}.${sig}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return NextResponse.redirect(msAuthUrl(nonce));
}
