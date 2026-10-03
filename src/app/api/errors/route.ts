import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { logError } from "@/lib/server/errors";

/** Browser-side crashes, reported by the app itself. Public-safe: capped, trimmed, never trusted for anything but display. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { message?: string; stack?: string; route?: string } | null;
  if (!b?.message || typeof b.message !== "string") return NextResponse.json({ ok: true });
  const p = await getProfile().catch(() => null);
  await logError({ source: "client", message: b.message, stack: typeof b.stack === "string" ? b.stack : null, route: typeof b.route === "string" ? b.route : null, userId: p?.id, email: p?.email });
  return NextResponse.json({ ok: true });
}
