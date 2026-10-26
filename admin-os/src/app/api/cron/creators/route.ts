import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { table, write } from "@/lib/sb";
import { PROGRAM, type Creator, type Video, daysLeft, endFreeMonth, sendCreatorEmail, syncAccess, verifiedCount } from "@/lib/creators";

const okBearer = (req: Request) => {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return secret.length >= 16 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
};

/** Daily: keep every creator's access through their deadline, send the timeline reminders (day 4, 9, 12), close the ones who ran out of time, and end finished free months. */
export async function GET(req: Request) {
  if (!okBearer(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const creators = (await table<Creator>("creators", { select: "*" })) ?? [];
  const videos = (await table<Video>("creator_videos", { select: "*" })) ?? [];
  const now = Date.now(), out = { reminded: 0, expired: 0, ended: 0, synced: 0 };
  for (const c of creators) {
    const done = verifiedCount(videos, c.id);
    if (c.status === "active" && c.access_at && c.deadline_at) {
      if ((await syncAccess(c)) === "extended") out.synced++;
      const day = Math.floor((now - new Date(c.access_at).getTime()) / 86_400_000);
      const left = daysLeft(c.deadline_at, now) ?? 0;
      if (done >= PROGRAM.videosNeeded) continue; // waiting on you, not on them
      if (left < 0) { // the window is over and the videos aren't in
        await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { status: "expired", closed_note: `Window ended with ${done}/${PROGRAM.videosNeeded} verified` } });
        await sendCreatorEmail("expired", c, { done }); out.expired++; continue;
      }
      const due = PROGRAM.remindOnDay.filter((d) => d <= day).length; // how many reminders should have gone by today
      if (c.reminders_sent < due) { const m = await sendCreatorEmail("reminder", c, { left, done }); if (m.ok) { await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { reminders_sent: c.reminders_sent + 1, last_reminded_at: new Date().toISOString() } }); out.reminded++; } }
    }
    if (c.status === "rewarded" && c.reward_ends_at && new Date(c.reward_ends_at).getTime() < now) {
      const r = await endFreeMonth(c);
      if (r === "ended") { await sendCreatorEmail("reward_end", c); out.ended++; }
      await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { reward_ends_at: null, closed_note: `Free month finished (${r})` } });
    }
  }
  return NextResponse.json(out);
}
