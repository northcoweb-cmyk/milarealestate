import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { write } from "@/lib/sb";

/** Removes one person from the waitlist (they stop getting launch emails and can join again later). */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string };
  if (!/^[0-9a-f-]{36}$/i.test(String(b.id ?? ""))) return NextResponse.json({ error: "Missing person." }, { status: 400 });
  const r = await write("waitlist", "DELETE", { filter: `id=eq.${b.id}` });
  if (!r) return NextResponse.json({ error: "The removal didn't go through. Try again." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
