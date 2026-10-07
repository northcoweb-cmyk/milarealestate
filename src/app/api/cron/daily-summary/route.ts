import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { sendEmailNotification } from "@/lib/notify";
import { dailySummaryEmail, summaryHasContent } from "@/lib/daily-summary";
import { startOfDay, addDays } from "@/lib/time";

const ACTIVE_DAYS = 7; // only people who've used Mila this week get an email, so it never turns into spam
const MAX_PER_RUN = 200;

/** Scheduled morning summary (Vercel Cron, protected by CRON_SECRET). Sent at most once a day, only if the person opted in and was recently active. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const done = (await store.list("notifications", p.id)).some((x) => x.title === "Daily summary" && x.created_at.slice(0, 10) === now.toISOString().slice(0, 10));
    if (done) { skipped++; continue; }
    const start = startOfDay(now, tz), end = addDays(start, 1, tz);
    const events = (await store.list("calendar_events", p.id)).filter((e) => e.status !== "cancelled" && new Date(e.start_at) >= start && new Date(e.start_at) < end).sort((a, b) => a.start_at.localeCompare(b.start_at));
    const tasks = (await store.list("tasks", p.id)).filter((t) => t.status === "open" && t.due_at && new Date(t.due_at) < end);
    const approvals = (await store.list("approvals", p.id)).filter((a) => a.status === "pending");
    const input = { name: p.full_name || "", tz, appUrl: base, events, tasks, approvals };
    if (!summaryHasContent(input)) { skipped++; continue; }
    const m = dailySummaryEmail(input);
    if (await sendEmailNotification(p.email, m.subject, m.text, m.html)) {
      sent++;
      await store.insert("notifications", p.id, { channel: "email", title: "Daily summary", body: m.subject, status: "sent", related_task_id: null });
    } else skipped++;
  }
  return NextResponse.json({ sent, skipped });
}
