// The post/invite/prep for an event that already happened leaves the list; follow-ups and upcoming events are untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { buildCtx } from "../src/lib/agent/engine.ts";
import { expireStale } from "../src/lib/agent/overdue.ts";

const NOW = new Date("2026-10-15T15:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

test("pre-event items for a finished open house are cleared, follow-ups and future events are kept", async () => {
  const a = await newAgent({ now: NOW, tz: "America/New_York", seed: false });
  const old = await store.insert("properties", a.id, { address: "45 Oak Avenue", city: "Austin", state: "TX" } as never);
  const next = await store.insert("properties", a.id, { address: "9 Elm Street", city: "Austin", state: "TX" } as never);
  const ev = (pid: string, off: number) => store.insert("calendar_events", a.id, { title: "Open house", kind: "open_house", start_at: day(off), end_at: day(off + 0.1), location: null, property_id: pid, contact_id: null, status: "confirmed", source: "mila", external_id: null, synced_at: null, workflow_run_id: null, notes: null } as never);
  await ev(old.id, -8); await ev(next.id, 3);
  const mk = (title: string, pid: string, o: Record<string, unknown> = {}) => store.insert("tasks", a.id, { kind: "task", title, subtitle: null, priority: "important", priority_reason: null, status: "open", due_at: null, contact_id: null, property_id: pid, approval_id: null, workflow_run_id: null, completed_at: null, ...o } as never);
  const post = await mk("Create Instagram post for 45 Oak Avenue", old.id);
  const follow = await mk("Follow up with open house visitors at 45 Oak Avenue", old.id, { kind: "follow_up" });
  const future = await mk("Create Instagram post for 9 Elm Street", next.id);
  const pst = await store.insert("social_posts", a.id, { platform: "instagram", caption: "x", hashtags: [], slides: [], status: "pending_approval", property_id: old.id, event_id: null } as never);
  const appr = await store.insert("approvals", a.id, { action: "publish_social", title: "Instagram post", summary: "Open house post", payload: { tool: "publish_social_post", args: { postId: pst.id } }, risk: "normal", status: "pending", result: null, error: null, blocked_integration: null, workflow_run_id: null, decided_at: null, executed_at: null } as never);
  const r = await expireStale(await buildCtx(a.profile));
  assert.deepEqual(r, { tasks: 1, approvals: 1 });
  assert.equal((await store.get("tasks", a.id, post.id))!.status, "dismissed");
  assert.equal((await store.get("tasks", a.id, follow.id))!.status, "open");
  assert.equal((await store.get("tasks", a.id, future.id))!.status, "open");
  assert.equal((await store.get("approvals", a.id, appr.id))!.status, "rejected");
});
