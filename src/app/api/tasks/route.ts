import { api } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { computePriorities } from "@/lib/agent/prioritize";

export const GET = api(async ({ profile }) => {
  const ctx = await buildCtx(profile);
  const [tasks, approvals, contacts] = await Promise.all([ctx.store.list("tasks", profile.id), ctx.store.list("approvals", profile.id), ctx.store.list("contacts", profile.id)]);
  const order = { urgent: 0, important: 1, upcoming: 2, low: 3 } as const;
  const open = tasks.filter((t) => t.status === "open").sort((a, b) => order[a.priority] - order[b.priority] || (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));
  const done = tasks.filter((t) => t.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")).slice(0, 20);
  void computePriorities;
  return { open, done, approvals: approvals.filter((a) => a.status === "pending" || (a.status === "approved" && a.blocked_integration)), contacts: Object.fromEntries(contacts.map((c) => [c.id, { name: c.name, color: c.avatar_color }])) };
});
