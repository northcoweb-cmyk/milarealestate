import { NextResponse } from "next/server";
import { getWho, isAuthed } from "@/lib/auth";
import { write } from "@/lib/sb";

const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const PLATFORMS = ["tiktok", "x", "instagram"];

async function guard(req: Request) {
  if (!(await isAuthed())) return { err: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return { err: NextResponse.json({ error: "Bad origin." }, { status: 403 }) };
  const who = await getWho();
  if (!who) return { err: NextResponse.json({ error: "Pick who you are first." }, { status: 403 }) };
  return { who };
}

/** Add a post log, an outreach log or a note. Nothing here can touch user data. */
export async function POST(req: Request) {
  const g = await guard(req); if (g.err) return g.err;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = b.kind === "post" || b.kind === "outreach" || b.kind === "note" ? b.kind : null;
  if (!kind) return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
  const platform = typeof b.platform === "string" && PLATFORMS.includes(b.platform) ? b.platform : null;
  if (kind !== "note" && !platform) return NextResponse.json({ error: "Pick a platform." }, { status: 400 });
  const note = clip(b.note, 2000), handle = clip(b.handle, 80), link = clip(b.link, 300);
  if (kind === "note" && !note) return NextResponse.json({ error: "Write something first." }, { status: 400 });
  if (kind === "outreach" && !handle) return NextResponse.json({ error: "Who did you talk to?" }, { status: 400 });
  if (link && !/^https?:\/\//i.test(link)) return NextResponse.json({ error: "The link should start with https://" }, { status: 400 });
  const row = await write("os_items", "POST", { body: { kind, platform, note, handle, link, by: g.who } });
  if (!row) return NextResponse.json({ error: "Couldn't save. Run migration 0010 in Supabase, then try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const g = await guard(req); if (g.err) return g.err;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  await write("os_items", "DELETE", { filter: `id=eq.${id}` });
  return NextResponse.json({ ok: true });
}
