import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { bearerMatches } from "@/lib/server/bearer";
import { sendEmailNotification } from "@/lib/notify";
import { dailySummaryEmail, summaryHasContent } from "@/lib/daily-summary";
import { startOfDay, addDays } from "@/lib/time";

const ACTIVE_DAYS = 7; // only people who've used Mila this week get an email, so it never turns into spam
const MAX_PER_RUN = 200;

/** Scheduled summary emails (Vercel Cron, protected by CRON_SECRET): the morning plan, and with ?mode=evening the evening wrap-up. At most one of each a day, only if the person opted in and was recently active. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!bearerMatches(req, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const evening = new URL(req.url).searchParams.get("mode") === "evening";
  const TITLE = evening ? "Evening summary" : "Daily summary";
  const store = getStore();
  const now = new Date();
  const since = new Date(now.getTime() - ACTIVE_DAYS * 86_400_000).toISOString();
  const activeIds = new Set((await store.listAll("messages")).filter((m) => m.role === "user" && m.created_at >= since).map((m) => m.user_id));
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.milarealestate.app").replace(/\/$/, "");
  let sent = 0, skipped = 0;
  for (const p of await store.listAll("profiles")) {
    if (sent >= MAX_PER_RUN) break;
    const n = p.settings?.notifications;
    if (!activeIds.has(p.id) || p.is_demo || !n || n.channels.email === false || n.topics.daily_summary === false) { skipped++; continue; }
    const tz = p.timezone || "America/New_York";
    const done = (await store.list("notifications", p.id)).some((x) => x.title === TITLE && x.created_at.slice(0, 10) === now.toISOString().slice(0, 10));
    if (done) { skipped++; continue; }
    const start = startOfDay(now, tz), end = addDays(start, 1, tz), end2 = addDays(start, 2, tz);
    const live = (await store.list("calendar_events", p.id)).filter((e) => e.status !== "cancelled");
    const inDay = (iso: string, a: Date, b: Date) => new Date(iso) >= a && new Date(iso) < b;
    const events = live.filter((e) => inDay(e.start_at, start, end)).sort((a, b) => a.start_at.localeCompare(b.start_at));
    const tasks = (await store.list("tasks", p.id)).filter((t) => t.status === "open" && t.due_at && new Date(t.due_at) < end);
    const approvals = (await store.list("approvals", p.id)).filter((a) => a.status === "pending");
    const allRem = (await store.list("reminders", p.id)).filter((r) => r.status !== "cancelled");
    // morning: today's reminders. evening: what is still undone today, and tomorrow's reminders and events
    const reminders = allRem.filter((r) => inDay(r.remind_at, start, end)).filter((r) => !evening || r.status === "pending").sort((a, b) => a.remind_at.localeCompare(b.remind_at));
    const tomorrow = evening ? { events: live.filter((e) => inDay(e.start_at, end, end2)).sort((a, b) => a.start_at.localeCompare(b.start_at)), reminders: allRem.filter((r) => r.status === "pending" && inDay(r.remind_at, end, end2)).sort((a, b) => a.remind_at.localeCompare(b.remind_at)) } : undefined;
    const input = { name: p.full_name || "", tz, appUrl: base, mode: evening ? "evening" as const : "morning" as const, events: evening ? events.filter((e) => new Date(e.start_at) > now) : events, tasks, approvals, reminders, tomorrow };
    if (!summaryHasContent(input)) { skipped++; continue; }
    const m = dailySummaryEmail(input);
    if (await sendEmailNotification(p.email, m.subject, m.text, m.html)) {
      sent++;
      await store.insert("notifications", p.id, { channel: "email", title: TITLE, body: m.subject, status: "sent", related_task_id: null });
    } else skipped++;
  }
  return NextResponse.json({ sent, skipped });
}
