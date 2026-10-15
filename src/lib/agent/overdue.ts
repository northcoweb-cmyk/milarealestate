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
