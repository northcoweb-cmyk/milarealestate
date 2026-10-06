import { NextResponse } from "next/server";
import { checkLogin, startSession } from "@/lib/auth";

const hits = new Map<string, { n: number; t: number }>();

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "x").split(",")[0].trim();
  const h = hits.get(ip); const now = Date.now();
  if (h && now - h.t < 10 * 60_000 && h.n >= 8) return NextResponse.redirect(new URL("/login?e=rate", req.url), 303);
  const f = await req.formData();
  const ok = checkLogin(String(f.get("email") ?? ""), String(f.get("password") ?? ""));
  if (!ok) { hits.set(ip, { n: h && now - h.t < 10 * 60_000 ? h.n + 1 : 1, t: h && now - h.t < 10 * 60_000 ? h.t : now }); return NextResponse.redirect(new URL("/login?e=bad", req.url), 303); }
  hits.delete(ip);
  await startSession();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
