import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { logError } from "@/lib/server/errors";
import { clientIp, hit } from "@/lib/server/rate-limit";

const MAX_BODY = 8_000;

/**
 * Browser-side crashes, reported by the app itself. Public-safe by design: it works signed out (login-page crashes),
 * so it is size-capped, rate-limited per visitor and globally, sanitised, and never trusted for anything but display.
 */
export async function POST(req: Request) {
  const ok = NextResponse.json({ ok: true });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return ok;
  if (!hit(`err:ip:${clientIp(req)}`, 10, 60_000) || !hit("err:all", 120, 60_000)) return NextResponse.json({ ok: true, limited: true }, { status: 429 });
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY) return ok;
  let b: { message?: unknown; stack?: unknown; route?: unknown } | null = null;
  try { b = JSON.parse(raw); } catch { return ok; }
  if (!b || typeof b.message !== "string" || !b.message.trim()) return ok;
  const p = await getProfile().catch(() => null);
  await logError({ source: "client", message: b.message, stack: typeof b.stack === "string" ? b.stack : null, route: typeof b.route === "string" ? b.route : null, userId: p?.id, email: p?.email });
  return ok;
}
