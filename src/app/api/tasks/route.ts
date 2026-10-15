import { api } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { computePriorities } from "@/lib/agent/prioritize";
import { expireStale, sweepOverdue } from "@/lib/agent/overdue";

export const GET = api(async ({ profile }) => {
  const ctx = await buildCtx(profile);
  await expireStale(ctx); // the post/invite/prep for an event that already happened leaves the list
  const [tasks, approvals, contacts] = await Promise.all([ctx.store.list("tasks", profile.id), ctx.store.list("approvals", profile.id), ctx.store.list("contacts", profile.id)]);
  const { catchUp } = await sweepOverdue(ctx, tasks, contacts); // old unimportant items leave the list; important ones become catch-ups
  const catchIds = new Set(catchUp.map((c) => c.task.id));
  const order = { urgent: 0, important: 1, upcoming: 2, low: 3 } as const;
  const open = tasks.filter((t) => t.status === "open" && !catchIds.has(t.id)).sort((a, b) => order[a.priority] - order[b.priority] || (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));
  const saved = profile.settings.task_order ?? [];
  if (saved.length) { const at = new Map(saved.map((id, i) => [id, i])); open.sort((a, b) => (at.has(a.id) ? at.get(a.id)! : -1) - (at.has(b.id) ? at.get(b.id)! : -1)); } // new tasks (not in the saved order) come first, in priority order; the rest keep the order the person set
  const done = tasks.filter((t) => t.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")).slice(0, 20);
  void computePriorities;
  return { open, done, catchUp: catchUp.map(({ task, ago, why, ask }) => ({ id: task.id, title: task.title, kind: task.kind, contact_id: task.contact_id, ago, why, ask })), approvals: approvals.filter((a) => a.status === "pending" || (a.status === "approved" && a.blocked_integration)), contacts: Object.fromEntries(contacts.map((c) => [c.id, { name: c.name, color: c.avatar_color }])) };
});
