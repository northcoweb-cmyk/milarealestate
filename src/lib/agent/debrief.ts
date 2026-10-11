import { DAY_MS, fmtTime, sameDay } from "../time";
import type { Ctx } from "./context";
import { firstName, plural } from "./context";
import { computePriorities } from "./prioritize";

export function greetingFor(now: Date, tz: string, name: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
  const part = h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${firstName(name)}.`;
}

/** Everything the daily debrief shows. Pure data — no AI calls, so it's free to render. */
export async function buildDebrief(ctx: Ctx) {
  const { store, userId, now, tz } = ctx;
  const [events, tasks, contacts, drafts] = await Promise.all([store.list("calendar_events", userId), store.list("tasks", userId), store.list("contacts", userId), store.list("email_drafts", userId)]);
  const today = events.filter((e) => e.status === "confirmed" && sameDay(new Date(e.start_at), now, tz)).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const open = tasks.filter((t) => t.status === "open");
  const approvals = open.filter((t) => t.kind === "approval");
  const dueEnd = now.getTime() + 18 * 3_600_000;
  const followups = open.filter((t) => t.kind === "follow_up" && (!t.due_at || new Date(t.due_at).getTime() < dueEnd));
  const noticed: string[] = [];

  const pr = await computePriorities(ctx);
  for (const p of pr.filter((x) => x.source === "contact" && /no contact in/.test(x.reason)).slice(0, 2)) {
    const d = /no contact in (\d+) days/.exec(p.reason)?.[1];
    noticed.push(`${firstName(p.title)} hasn't been in touch for ${d} days.`);
  }
  for (let i = 0; i < today.length; i++) for (let j = i + 1; j < today.length; j++) {
    if (new Date(today[i].start_at) < new Date(today[j].end_at) && new Date(today[j].start_at) < new Date(today[i].end_at)) noticed.push(`Your ${fmtTime(today[j].start_at, tz)} ${today[j].title.split(/[—,]/)[0].trim().toLowerCase()} conflicts with ${today[i].title.split(/[—,]/)[0].trim().toLowerCase()}.`);
  }
  for (const a of approvals.slice(0, 2)) if (/open house/i.test(a.title)) noticed.push(`Your ${a.title.replace(/ — .*/, "").toLowerCase()} still needs approval.`);
  const newLeads = contacts.filter((c) => c.type === "lead" && now.getTime() - new Date(c.created_at).getTime() < DAY_MS).length;
  if (newLeads) noticed.push(`${plural(newLeads, "new lead")} arrived since yesterday.`);
  const stale = drafts.filter((d) => d.stale).length;
  if (stale) noticed.push(`${plural(stale, "message")} may be out of date after a schedule change.`);

  return { today, approvals, followups, noticed: noticed.slice(0, 4), priorities: pr, counts: { appointments: today.length, followups: followups.length, approvals: approvals.length } };
}

/**
 * What the day's plan is built from. A plan from "Mila's own calendar only" must say so: an appointment that lives in Google or Outlook, or a client reply sitting
 * in an inbox Mila cannot read, is invisible to it. Returns null when both a calendar and an inbox are connected.
 */
export async function coverageNote(ctx: Ctx): Promise<{ text: string; calendars: string[]; email: string[] } | null> {
  const rows = (await ctx.store.list("integrations", ctx.userId)).filter((i) => i.status === "connected");
  const has = (p: string, scope?: string) => rows.some((r) => r.provider === p && (!scope || r.scopes.some((s) => s.includes(scope))));
  const calendars = ["Mila's own calendar", ...(has("google", "calendar") ? ["Google Calendar"] : []), ...(has("outlook") ? ["Outlook"] : []), ...(has("ics") ? ["your calendar link"] : [])];
  const email = [...(has("google", "gmail") ? ["Gmail"] : []), ...(has("outlook") ? ["Outlook mail"] : [])];
  const missing: string[] = [];
  if (calendars.length === 1) missing.push("Google Calendar, Outlook and calendar links aren't connected, so I only see what's in Mila's own calendar");
  if (!email.length) missing.push("no email account is connected, so replies sitting in your inbox aren't part of this");
  if (!missing.length) return null;
  return { text: `This plan is built from Mila only: ${missing.join(", and ")}. Anything booked or received elsewhere won't show up here.`, calendars, email };
}
