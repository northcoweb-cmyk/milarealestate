import type { Contact, CalendarEvent, Task, TaskPriority } from "../types";
import { DAY_MS } from "../time";
import type { Ctx } from "./context";
import { label } from "./context";

/**
 * Prioritisation without any AI call (free and instant). A score blends
 * deadline proximity, client importance/stage, silence since last contact,
 * and appointment proximity. Buckets are capped so Mila never says
 * "everything is urgent".
 */
export interface Scored {
  id: string;
  source: "task" | "contact" | "event";
  title: string;
  subtitle?: string;
  reason: string;
  score: number;
  priority: TaskPriority;
  contactId?: string | null;
  taskId?: string;
  kind: string;
}

const STAGE_BOOST: Record<string, number> = { showing: 18, offer: 28, under_contract: 25, active: 8, qualified: 6, new: 10 };

export function bucket(score: number): TaskPriority {
  return score >= 60 ? "urgent" : score >= 35 ? "important" : score >= 15 ? "upcoming" : "low";
}

export function scoreTask(t: Task, c: Contact | undefined, now: Date): { score: number; reason: string } {
  let score = 0;
  const why: string[] = [];
  if (t.due_at) {
    const hrs = (new Date(t.due_at).getTime() - now.getTime()) / 3_600_000;
    if (hrs < 0) { score += 45; why.push("overdue"); }
    else if (hrs < 24) { score += 38; why.push("due today"); }
    else if (hrs < 72) { score += 22; why.push("due in the next few days"); }
    else if (hrs < 24 * 7) { score += 10; }
  }
  if (t.kind === "approval") { score += 14; why.push("waiting on you"); }
  if (c) {
    score += c.importance * 6;
    score += STAGE_BOOST[c.status] ?? 0;
    if (STAGE_BOOST[c.status] && c.status !== "new" && c.status !== "active") why.push(`${label(c.status).toLowerCase()} stage`);
    if (c.budget_max && c.budget_max >= 800_000) score += 5;
  }
  return { score, reason: why.join(" · ") };
}

export async function computePriorities(ctx: Ctx): Promise<Scored[]> {
  const { store, userId, now } = ctx;
  const [tasks, contacts, events] = await Promise.all([store.list("tasks", userId), store.list("contacts", userId), store.list("calendar_events", userId)]);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const out: Scored[] = [];
  const taskContacts = new Set<string>();

  for (const t of tasks.filter((x) => x.status === "open")) {
    const c = t.contact_id ? byId.get(t.contact_id) : undefined;
    if (c) taskContacts.add(c.id);
    const { score, reason } = scoreTask(t, c, now);
    out.push({ id: t.id, taskId: t.id, source: "task", title: c ? c.name : t.title, subtitle: c ? t.title : t.subtitle ?? undefined, reason: reason || (t.priority_reason ?? ""), score, priority: bucket(score), contactId: t.contact_id, kind: t.kind });
  }

  // Contacts that have gone quiet, with no explicit task
  for (const c of contacts) {
    if (taskContacts.has(c.id) || c.status === "closed" || c.status === "inactive" || ["vendor", "agent", "other"].includes(c.type)) continue;
    let score = 0;
    const why: string[] = [];
    if (c.next_action_at) {
      const hrs = (new Date(c.next_action_at).getTime() - now.getTime()) / 3_600_000;
      if (hrs < 0) { score += 40; why.push("follow-up overdue"); } else if (hrs < 24) { score += 34; why.push("follow-up due today"); }
    }
    if (c.last_contact_at) {
      const days = Math.floor((now.getTime() - new Date(c.last_contact_at).getTime()) / DAY_MS);
      const threshold = c.status === "nurture" ? 30 : c.status === "showing" || c.status === "offer" || c.status === "under_contract" ? 3 : 7;
      if (days >= threshold) { score += Math.min(25, 8 + (days - threshold) * 2); why.push(`no contact in ${days} days`); }
    } else if (c.status === "new" && now.getTime() - new Date(c.created_at).getTime() > 2 * DAY_MS) { score += 20; why.push("new lead, not yet contacted"); } // someone added today or yesterday does not need chasing yet
    if (score === 0) continue;
    score += c.importance * 6 + (STAGE_BOOST[c.status] ?? 0);
    if (score < 28) continue; // only follow-ups that are really due this week, never a long list of maybes
    out.push({ id: c.id, source: "contact", title: c.name, subtitle: c.next_action ?? undefined, reason: why.join(" · "), score, priority: bucket(score), contactId: c.id, kind: "follow_up" });
  }

  // Appointments in the next 24h
  for (const e of events.filter((x) => x.status === "confirmed")) {
    const hrs = (new Date(e.start_at).getTime() - now.getTime()) / 3_600_000;
    if (hrs < 0 || hrs > 30) continue;
    const score = hrs < 4 ? 62 : hrs < 12 ? 50 : 36;
    out.push({ id: e.id, source: "event", title: e.title, subtitle: undefined, reason: hrs < 4 ? "starts soon" : "coming up", score, priority: bucket(score), kind: "event" });
  }

  out.sort((a, b) => b.score - a.score);
  // never more than 3 urgent: demote the rest
  let urgent = 0;
  for (const s of out) if (s.priority === "urgent" && ++urgent > 3) s.priority = "important";
  return out;
}

export function describeEvent(e: CalendarEvent) { return e.title; }
