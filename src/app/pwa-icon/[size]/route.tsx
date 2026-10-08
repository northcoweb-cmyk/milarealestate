import { NextResponse } from "next/server";

// Old icon URLs (cached by phones and the service worker) now point at the current static icons.
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = parseInt((await params).size) || 192;
  const maskable = new URL(req.url).searchParams.get("maskable") === "1";
  const to = maskable ? "/icon-maskable-512.png" : size <= 180 ? "/apple-touch-icon.png" : size <= 192 ? "/icon-192.png" : "/icon-512.png";
  return NextResponse.redirect(new URL(to, req.url), 308);
}
