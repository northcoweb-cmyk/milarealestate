import { NextResponse } from "next/server";
import { getWho, isAuthed } from "@/lib/auth";
import { table, write } from "@/lib/sb";
import { type Creator, type Video, sendCreatorEmail } from "@/lib/creators";

/** Check one submitted video: verified (with the four checks and its views), needs a change (with what to fix), or rejected. Ryan only. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if ((await getWho()) !== "ryan") return NextResponse.json({ error: "Only Ryan can check videos." }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: string; views?: number; checks?: Record<string, boolean>; note?: string };
  if (!b.id || !["verified", "changes", "rejected", "submitted"].includes(String(b.status))) return NextResponse.json({ error: "Missing video or status." }, { status: 400 });
  const v = (await table<Video>("creator_videos", { select: "*", filter: `id=eq.${encodeURIComponent(b.id)}` }))?.[0];
  if (!v) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  const checks = Object.fromEntries(Object.entries(b.checks ?? {}).map(([k, x]) => [k, x === true]));
  if (b.status === "verified" && !(checks.shows_app && checks.disclosure && checks.tagged && checks.no_claims)) return NextResponse.json({ error: "Tick all four checks before verifying." }, { status: 400 });
  if (b.status === "changes" && !String(b.note ?? "").trim()) return NextResponse.json({ error: "Say what needs to change." }, { status: 400 });
  const r = await write("creator_videos", "PATCH", { filter: `id=eq.${v.id}`, body: { status: b.status, checks, views: Number.isFinite(Number(b.views)) && Number(b.views) >= 0 ? Math.round(Number(b.views)) : v.views, note: String(b.note ?? "").trim().slice(0, 300) || null, verified_at: b.status === "verified" ? new Date().toISOString() : null } });
  if (!r) return NextResponse.json({ error: "The change didn't save." }, { status: 502 });
  let mailed = "";
  if (b.status === "changes") {
    const c = (await table<Creator>("creators", { select: "*", filter: `id=eq.${v.creator_id}` }))?.[0];
    if (c) { const m = await sendCreatorEmail("changes", c, { note: String(b.note) }); mailed = m.ok ? " They were emailed." : ` Email not sent: ${m.error}`; }
  }
  return NextResponse.json({ ok: true, message: `Saved.${mailed}` });
}
