import { NextResponse } from "next/server";
import { getWho, isAuthed } from "@/lib/auth";
import { table, write } from "@/lib/sb";
import { ensureEntry, sendInvite, smtpConfigured } from "@/lib/invites";
import { PROGRAM, type Creator, daysLeft, giveFreeMonth, newToken, profileOf, sendCreatorEmail, submitUrl, syncAccess, verifiedCount, type Video } from "@/lib/creators";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const DAY = 86_400_000;

/** Everything the creator program can do, one action per call. Ryan only. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return bad("Not signed in.", 401);
  if ((await getWho()) !== "ryan") return bad("Only Ryan can run the creator program.", 403);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return bad("Bad origin.", 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? "");

  if (action === "add") {
    const name = String(b.name ?? "").trim().slice(0, 80), email = String(b.email ?? "").trim().toLowerCase();
    if (name.length < 2) return bad("Add their name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad("Enter their email.");
    const row = { name, email, handle: String(b.handle ?? "").trim().slice(0, 60) || null, platform: String(b.platform ?? "").trim().slice(0, 20) || null, followers: Number(b.followers) > 0 ? Math.round(Number(b.followers)) : null, notes: String(b.notes ?? "").trim().slice(0, 500) || null, token: newToken() };
    const r = await write<Creator>("creators", "POST", { body: row });
    if (!r?.[0]) return bad("Couldn't save. Is that email already a creator, or is migration 0014_creators.sql not run yet?", 502);
    return NextResponse.json({ ok: true, id: r[0].id, message: `${name} added. Open them to grant access.` });
  }

  const id = String(b.id ?? "");
  const found = id ? await table<Creator>("creators", { select: "*", filter: `id=eq.${encodeURIComponent(id)}` }) : null;
  const c = found?.[0];
  if (!c) return bad("Creator not found.", 404);
  const videos = (await table<Video>("creator_videos", { select: "*", filter: `creator_id=eq.${c.id}` })) ?? [];

  if (action === "grant_access") {
    if (c.status === "active") return bad("They already have access.");
    if (!smtpConfigured() && !(await profileOf(c.email))) return bad("Email isn't set up (SMTP), so the sign-in invite can't be sent.");
    const now = new Date(), deadline = new Date(now.getTime() + PROGRAM.windowDays * DAY);
    const r = await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { status: "active", access_at: now.toISOString(), deadline_at: deadline.toISOString(), reminders_sent: 0, closed_note: null } });
    if (!r) return bad("The change didn't save.", 502);
    const next = { ...c, status: "active" as const, access_at: now.toISOString(), deadline_at: deadline.toISOString() };
    let invite = "";
    try {
      if (!(await profileOf(c.email))) { const e = await ensureEntry(c.email, c.name, "creator"); await sendInvite(e); invite = " Sign-in invite sent."; }
    } catch (e) { invite = ` The sign-in invite failed (${e instanceof Error ? e.message : "error"}); use Invites to resend.`; }
    const m = await sendCreatorEmail("welcome", next);
    const sync = await syncAccess(next);
    return NextResponse.json({ ok: true, message: `Access granted. Videos due ${deadline.toISOString().slice(0, 10)}.${invite}${m.ok ? " Welcome email sent." : ` Welcome email not sent: ${m.error}`} (${sync})` });
  }

  if (action === "remind") {
    const m = await sendCreatorEmail("reminder", c, { left: Math.max(0, daysLeft(c.deadline_at) ?? 0), done: verifiedCount(videos, c.id) });
    if (!m.ok) return bad(m.error ?? "Email failed.", 502);
    await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { last_reminded_at: new Date().toISOString(), reminders_sent: c.reminders_sent + 1 } });
    return NextResponse.json({ ok: true, message: "Reminder sent." });
  }

  if (action === "extend") {
    const base = Math.max(Date.now(), c.deadline_at ? new Date(c.deadline_at).getTime() : Date.now());
    const end = new Date(base + PROGRAM.extendDays * DAY).toISOString();
    await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { deadline_at: end, status: "active", closed_note: null } });
    await syncAccess({ ...c, status: "active", deadline_at: end });
    return NextResponse.json({ ok: true, message: `Deadline moved to ${end.slice(0, 10)}.` });
  }

  if (action === "reward") {
    const ok = verifiedCount(videos, c.id);
    if (ok < PROGRAM.videosNeeded && b.override !== true) return bad(`Only ${ok}/${PROGRAM.videosNeeded} videos are verified.`);
    const g = await giveFreeMonth(c);
    if (!g.ok) return bad(g.message, 409);
    await sendCreatorEmail("reward", c);
    return NextResponse.json({ ok: true, message: g.message });
  }

  if (action === "decline" || action === "close") {
    await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { status: action === "decline" ? "declined" : "expired", closed_note: String(b.note ?? "").slice(0, 200) || null } });
    return NextResponse.json({ ok: true, message: action === "decline" ? "Marked as declined." : "Closed." });
  }

  if (action === "copy_link") return NextResponse.json({ ok: true, message: submitUrl(c.token) });
  if (action === "delete") { await write("creators", "DELETE", { filter: `id=eq.${c.id}` }); return NextResponse.json({ ok: true, message: "Deleted." }); }
  return bad("Unknown action.");
}
