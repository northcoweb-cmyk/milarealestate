import { NextResponse } from "next/server";
import { createHmac, randomBytes } from "node:crypto";
import { getUserId } from "@/lib/auth";
import { GOOGLE_SCOPES, authUrl, googleConfigured, type GoogleService } from "@/lib/integrations/google";
import { cookies } from "next/headers";

// Begins the OAuth flow. `state` is bound to the user via a signed, short-lived cookie (CSRF protection).
export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.redirect(new URL("/welcome", req.url));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/settings/connections?error=not_configured", req.url));
  const url = new URL(req.url);
  const wanted = (url.searchParams.get("services") ?? "calendar,gmail,contacts,sheets").split(",").filter((s): s is GoogleService => s in GOOGLE_SCOPES && s !== "base");
  const nonce = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", process.env.SESSION_SECRET || process.env.INTEGRATION_ENCRYPTION_KEY || "dev").update(`${nonce}.${uid}`).digest("hex");
  (await cookies()).set("mila_oauth", `${nonce}.${sig}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return NextResponse.redirect(authUrl(wanted, nonce));
}
