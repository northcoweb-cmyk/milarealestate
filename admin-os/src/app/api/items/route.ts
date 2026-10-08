import { NextResponse } from "next/server";
import { getWho, isAuthed } from "@/lib/auth";
import { write } from "@/lib/sb";
import { fetchStats, linkMatches } from "@/lib/stats";

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
  if (kind === "post" && link && platform && !linkMatches(platform, link)) return NextResponse.json({ error: `That link isn't a ${platform === "x" ? "X" : platform === "tiktok" ? "TikTok" : "Instagram"} link. Check the platform you picked.` }, { status: 400 });
  const st = kind === "post" && link && platform ? await fetchStats(platform, link) : null;
  const stats = st ? { ...st, stats_at: new Date().toISOString() } : {};
  let row = await write("os_items", "POST", { body: { kind, platform, note, handle, link, by: g.who, ...stats } });
  if (!row && st) row = await write("os_items", "POST", { body: { kind, platform, note, handle, link, by: g.who } }); // migration 0011 not run yet: still save the post
  if (!row) return NextResponse.json({ error: "Couldn't save. Run migration 0010 in Supabase, then try again." }, { status: 500 });
  return NextResponse.json({ ok: true, stats: !!st });
}

/** Re-read the numbers for one post (?id=) or for the 30 newest posts (no id). */
export async function PUT(req: Request) {
  const g = await guard(req); if (g.err) return g.err;
  const id = new URL(req.url).searchParams.get("id");
  const { table } = await import("@/lib/sb");
  const rows = await table<{ id: string; platform: string | null; link: string | null }>("os_items", { select: "id,platform,link", filter: `kind=eq.post&link=not.is.null${id ? `&id=eq.${id}` : ""}`, order: "created_at.desc", max: id ? 1 : 30 });
  if (!rows) return NextResponse.json({ error: "Run migration 0011 in Supabase first." }, { status: 500 });
  let updated = 0, failed = 0;
  for (const r of rows) {
    const st = r.platform && r.link ? await fetchStats(r.platform, r.link) : null;
    if (!st) { failed++; continue; }
    const ok = await write("os_items", "PATCH", { filter: `id=eq.${r.id}`, body: { ...st, stats_at: new Date().toISOString() } });
    if (ok) updated++; else return NextResponse.json({ error: "Run migration 0011 in Supabase first." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated, failed });
}

export async function DELETE(req: Request) {
  const g = await guard(req); if (g.err) return g.err;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  await write("os_items", "DELETE", { filter: `id=eq.${id}` });
  return NextResponse.json({ ok: true });
}
