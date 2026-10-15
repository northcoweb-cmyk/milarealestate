import type { Ctx } from "./context";
import type { Contact, Task } from "../types";
import { startOfDay } from "../time";

export interface CatchUp { task: Task; daysAgo: number; ago: string; why: string; ask: string }

/** A to-do whose day has passed without being done. Unimportant ones are quietly taken off the list; important ones come back once, as a catch-up with what to do now, and can be declined. */
export async function sweepOverdue(ctx: Ctx, tasks: Task[], contacts: Contact[]): Promise<{ catchUp: CatchUp[]; removed: number }> {
  const today = startOfDay(ctx.now, ctx.tz).getTime();
  const catchUp: CatchUp[] = [];
  let removed = 0;
  for (const t of tasks) {
    if (t.status !== "open" || !t.due_at || t.kind === "approval" || t.approval_id) continue; // approvals have their own place until decided
    const due = new Date(t.due_at).getTime();
    if (due >= today) continue; // due today or later: still on the list
    const daysAgo = Math.max(1, Math.round((today - startOfDay(new Date(t.due_at), ctx.tz).getTime()) / 86_400_000));
    const important = t.priority === "urgent" || t.priority === "important" || t.kind === "follow_up";
    if (!important || daysAgo > 7) { await ctx.store.update("tasks", ctx.userId, t.id, { status: "dismissed", completed_at: null } as never); removed++; continue; }
    const who = t.contact_id ? contacts.find((c) => c.id === t.contact_id) : null;
    const ago = daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;
    const why = who && t.kind === "follow_up" ? `This was due ${ago}. ${who.name.split(" ")[0]} may be waiting to hear from you, so a quick note now keeps it warm.` : `This was due ${ago}. If it still matters, it's best to handle it today.`;
    const ask = who && t.kind === "follow_up" ? `Draft a follow-up message to ${who.name}` : `Help me with this now: ${t.title}`;
    catchUp.push({ task: t, daysAgo, ago, why, ask });
  }
  return { catchUp: catchUp.sort((a, b) => b.daysAgo - a.daysAgo), removed };
}

const PRE_EVENT = /\b(post|flyer|invite|invitation|sign.?in|prep|prepare|promote|promotion|announce|advertis|market(?:ing)?|stage|share|social|carousel|caption|story)\b/i;
const AFTER_EVENT = /\b(follow.?up|thank|recap|debrief|after)\b/i;

/**
 * Things that only made sense BEFORE an event (the post, the invite, the prep) disappear once the event is over:
 * open tasks are dismissed and waiting approvals are closed as expired. Follow-ups are never touched.
 * A property counts as "over" only when it has events, none of them is still ahead, and the last one ended before today.
 */
export async function expireStale(ctx: Ctx): Promise<{ tasks: number; approvals: number }> {
  const today = startOfDay(ctx.now, ctx.tz).getTime();
  const events = (await ctx.store.list("calendar_events", ctx.userId)).filter((e) => e.status !== "cancelled" && e.property_id);
  const over = new Set<string>();
  for (const pid of new Set(events.map((e) => e.property_id as string))) {
    const mine = events.filter((e) => e.property_id === pid);
    if (mine.every((e) => new Date(e.end_at).getTime() < today)) over.add(pid);
  }
  if (!over.size) return { tasks: 0, approvals: 0 };
  let tasks = 0, approvals = 0;
  for (const t of await ctx.store.list("tasks", ctx.userId)) {
    if (t.status !== "open" || !t.property_id || !over.has(t.property_id) || t.kind === "approval" || t.approval_id) continue;
    if (!PRE_EVENT.test(t.title) || AFTER_EVENT.test(t.title)) continue;
    await ctx.store.update("tasks", ctx.userId, t.id, { status: "dismissed", completed_at: null } as never); tasks++;
  }
  for (const a of await ctx.store.list("approvals", ctx.userId)) {
    if (a.status !== "pending" && !(a.status === "approved" && a.blocked_integration)) continue;
    const args = (a.payload?.args ?? {}) as { postId?: string; draftId?: string; draftIds?: string[] };
    let pid: string | null = null;
    if (args.postId) pid = (await ctx.store.get("social_posts", ctx.userId, args.postId))?.property_id ?? null;
    else if (args.draftId || args.draftIds?.length) pid = (await ctx.store.get("email_drafts", ctx.userId, (args.draftId ?? args.draftIds![0])))?.property_id ?? null;
    if (!pid || !over.has(pid) || a.action === "calendar_create" || a.action === "calendar_change" || a.action === "calendar_cancel") continue;
    if (!PRE_EVENT.test(`${a.title} ${a.summary ?? ""}`) || AFTER_EVENT.test(a.title)) continue;
    await ctx.store.update("approvals", ctx.userId, a.id, { status: "rejected", decided_at: new Date().toISOString(), error: "Expired: the event already happened." } as never); approvals++;
  }
  return { tasks, approvals };
}
