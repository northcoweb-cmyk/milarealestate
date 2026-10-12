import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { write } from "@/lib/sb";

/** Open / replied / resolved for a ticket. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
  if (!/^[0-9a-f-]{36}$/i.test(String(b.id)) || !["open", "replied", "resolved"].includes(String(b.status))) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const r = await write("feedback", "PATCH", { filter: `id=eq.${b.id}&category=eq.support_ticket`, body: { status: b.status } });
  return r ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Didn't save." }, { status: 502 });
}
