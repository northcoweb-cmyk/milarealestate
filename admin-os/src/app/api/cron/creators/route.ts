import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { table, write } from "@/lib/sb";
import { ensureEntry, sendInvite, smtpConfigured } from "@/lib/invites";
import { PROGRAM, type Creator, type Video, activityOf, daysLeft, endFreeMonth, keepPartnerAccess, monthKey, partnerVideosThisMonth, pausePartnerAccess, profileOf, sendCreatorEmail, syncAccess, verifiedCount } from "@/lib/creators";

const okBearer = (req: Request) => {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return secret.length >= 16 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
};
const DAY = 86_400_000;
const prevMonthKey = () => { const [y, m] = monthKey().split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };

/**
 * Daily. First-round creators: keep access through the deadline; nudge the ones who haven't signed in (day 2) or haven't used Mila (day 4);
 * remind on day 4, 9 and 12; close the ones who ran out of time; end finished free months.
 * Partners: reminders on the 15th and 25th if they're behind; on the 1st, renew everyone who met last month's videos and pause the rest.
 */
export async function GET(req: Request) {
  if (!okBearer(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const creators = (await table<Creator>("creators", { select: "*" })) ?? [];
  const videos = (await table<Video>("creator_videos", { select: "*" })) ?? [];
  const now = Date.now(), dom = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(new Date()));
  const out = { reminded: 0, expired: 0, ended: 0, synced: 0, nudged: 0, renewed: 0, paused: 0, partnerReminded: 0 };
  const mark = async (c: Creator, key: string) => { c.sent = { ...(c.sent ?? {}), [key]: new Date().toISOString() }; await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { sent: c.sent } }); };
  for (const c of creators) {
    const sent = c.sent ?? {};
    const done = verifiedCount(videos, c.id);
    if (c.status === "active" && c.access_at && c.deadline_at) {
      if ((await syncAccess(c)) === "extended") out.synced++;
      const day = Math.floor((now - new Date(c.access_at).getTime()) / DAY);
      const left = daysLeft(c.deadline_at, now) ?? 0;
      if (done >= PROGRAM.videosNeeded) continue; // waiting on you, not on them
      if (left < 0) { // the window is over and the videos aren't in
        await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { status: "expired", closed_note: `Window ended with ${done}/${PROGRAM.videosNeeded} verified` } });
        await sendCreatorEmail("expired", c, { done }); out.expired++; continue;
      }
      // "got a login, never used it": a nudge to sign in (with a fresh invite) and, once in, a nudge to actually try it
      const act = await activityOf(c.email, c.access_at);
      if (!act.account && day >= 2 && !sent.signin) {
        if (smtpConfigured()) { try { await sendInvite(await ensureEntry(c.email, c.name, "creator")); } catch { /* the nudge email below still goes */ } }
        if ((await sendCreatorEmail("signin", c, { left })).ok) { await mark(c, "signin"); out.nudged++; }
        continue;
      }
      if (act.account && act.messages === 0 && day >= 4 && !sent.use) { if ((await sendCreatorEmail("use", c, { left })).ok) { await mark(c, "use"); out.nudged++; } continue; }
      const due = PROGRAM.remindOnDay.filter((d) => d <= day).length; // how many reminders should have gone by today
      if (c.reminders_sent < due) { const m = await sendCreatorEmail("reminder", c, { left, done }); if (m.ok) { await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { reminders_sent: c.reminders_sent + 1, last_reminded_at: new Date().toISOString() } }); out.reminded++; } }
    }
    if (c.status === "rewarded" && c.reward_ends_at && new Date(c.reward_ends_at).getTime() < now) {
      const r = await endFreeMonth(c);
      if (r === "ended") { await sendCreatorEmail("reward_end", c); out.ended++; }
      await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { reward_ends_at: null, closed_note: `Free month finished (${r})` } });
    }
    if (c.status === "partner" || c.status === "paused") {
      const thisMonth = partnerVideosThisMonth(videos, c.id, new Date());
      if (c.status === "partner" && thisMonth < c.videos_per_month && (dom >= 25 ? !sent[`rem25:${monthKey()}`] : dom >= 15 && !sent[`rem15:${monthKey()}`])) {
        const key = dom >= 25 ? `rem25:${monthKey()}` : `rem15:${monthKey()}`;
        if ((await sendCreatorEmail("partner_reminder", c, { left: c.videos_per_month - thisMonth, done: thisMonth })).ok) { await mark(c, key); out.partnerReminded++; }
      }
      // the 1st: last month decides this month
      if (c.status === "partner" && sent.renewed !== monthKey() && c.partner_since && monthKey(new Date(c.partner_since)) !== monthKey()) {
        const last = prevMonthKey();
        const key = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).format(new Date(iso));
        const lastCount = videos.filter((v) => v.creator_id === c.id && v.kind === "partner" && v.status === "verified" && v.verified_at && key(v.verified_at) === last).length;
        if (lastCount >= c.videos_per_month) { await keepPartnerAccess(c); await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { sent: { ...(c.sent ?? {}), renewed: monthKey() } } }); out.renewed++; }
        else { await pausePartnerAccess(c); await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { status: "paused", sent: { ...(c.sent ?? {}), renewed: monthKey() } } }); await sendCreatorEmail("partner_paused", c, { done: lastCount }); out.paused++; }
      }
    }
  }
  return NextResponse.json(out);
}
