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
