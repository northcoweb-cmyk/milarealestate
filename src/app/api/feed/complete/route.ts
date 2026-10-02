import { api, bad, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";

// Checking off a plan item records a finished task (so it shows up in "Completed"); unchecking removes it.
const keyFor = (id: string, now: Date, tz: string) => `plan:${id}:${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now)}`;

export const POST = api(async ({ profile, req }) => {
  const b = await readJson<{ id?: string; title?: string; why?: string }>(req);
  const id = String(b.id ?? "").slice(0, 80), title = String(b.title ?? "").trim().slice(0, 200);
  if (!id || !title) throw bad("Missing item.");
  const ctx = await buildCtx(profile);
  const key = keyFor(id, ctx.now, ctx.tz);
  const existing = (await ctx.store.list("tasks", ctx.userId)).find((t) => t.priority_reason === key);
  if (existing) return { task: existing };
  const task = await ctx.store.insert("tasks", ctx.userId, { kind: "task", title, subtitle: b.why ? String(b.why).slice(0, 200) : null, priority: "low", priority_reason: key, status: "done", due_at: null, contact_id: null, property_id: null, approval_id: null, workflow_run_id: null, completed_at: ctx.now.toISOString() });
  return { task };
});

export const DELETE = api(async ({ profile, url }) => {
  const id = url.searchParams.get("id") ?? "";
  const ctx = await buildCtx(profile);
  const key = keyFor(id, ctx.now, ctx.tz);
  const n = await ctx.store.removeWhere("tasks", ctx.userId, (r) => (r as { priority_reason?: string }).priority_reason === key);
  return { removed: n };
});
