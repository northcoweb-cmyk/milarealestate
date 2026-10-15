// Yesterday's to-dos: unimportant ones leave the list, important ones come back as a catch-up the person can act on or decline.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { buildCtx } from "../src/lib/agent/engine.ts";
import { sweepOverdue } from "../src/lib/agent/overdue.ts";

const NOW = new Date("2026-10-15T15:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const mk = (uid: string, o: Record<string, unknown>) => store.insert("tasks", uid, { kind: "task", title: "x", subtitle: null, priority: "low", priority_reason: null, status: "open", due_at: null, contact_id: null, property_id: null, approval_id: null, workflow_run_id: null, completed_at: null, ...o } as never);

test("old unimportant tasks are removed; an important one becomes a catch-up; today's stays", async () => {
  const a = await newAgent({ now: NOW, tz: "America/New_York", seed: false });
  const old = await mk(a.id, { title: "Tidy the files", priority: "low", due_at: day(3) });
  const imp = await mk(a.id, { title: "Send comps to Dana", kind: "follow_up", priority: "important", due_at: day(2) });
  const today = await mk(a.id, { title: "Call the lender", priority: "important", due_at: new Date(NOW.getTime() + 3_600_000).toISOString() });
  const ancient = await mk(a.id, { title: "Very old urgent", priority: "urgent", due_at: day(12) });
  const ctx = await buildCtx(a.profile);
  const r = await sweepOverdue(ctx, await store.list("tasks", a.id), await store.list("contacts", a.id));
  assert.deepEqual(r.catchUp.map((c) => c.task.id), [imp.id]);
  assert.match(r.catchUp[0].ago, /2 days ago/);
  assert.equal((await store.get("tasks", a.id, old.id))!.status, "dismissed");
  assert.equal((await store.get("tasks", a.id, ancient.id))!.status, "dismissed"); // too old to catch up on
  assert.equal((await store.get("tasks", a.id, today.id))!.status, "open");
});
