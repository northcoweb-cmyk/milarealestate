import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { buildClientBrief } from "../src/lib/agent/client-brief.ts";
import { buildCtx } from "../src/lib/agent/engine.ts";

const now = new Date("2026-10-22T15:00:00Z");

test("a client summary says where they stand and gives now / coming up / later steps, from saved facts only", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await a.say("Add buyer Priya Shah, 240-555-0150, budget 650k, looking in Rockville");
  const r = await a.say("Summarize Priya");
  const t = r.milaMessage.content;
  assert.match(t, /Priya is a buyer/); assert.match(t, /\$650,000/); assert.match(t, /Do now:/); assert.match(t, /Coming up:/); assert.match(t, /Later:/);
  assert.doesNotMatch(t, /undefined|null|NaN/);
});

test("an overdue to-do and a quiet client both show up as things to do now", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const c: any = await store.insert("contacts", a.id, { name: "Dana Lee", email: "d@x.com", phone: "301-555-0100", type: "seller", status: "active", tags: [], notes: null, preferences: {}, location: "Gaithersburg", budget_min: null, budget_max: 700000, timeline: null, source: null, importance: 3, last_contact_at: "2026-10-01T12:00:00Z", next_action: null, next_action_at: null, avatar_color: "#888" });
  await store.insert("tasks", a.id, { kind: "task", title: "Send the CMA", subtitle: null, priority: "high", priority_reason: null, status: "open", due_at: "2026-10-15T12:00:00Z", contact_id: c.id, property_id: null, approval_id: null, workflow_run_id: null, completed_at: null } as never);
  const ctx = await buildCtx((await store.get("profiles", a.id, a.id)) as never, { now });
  const b = await buildClientBrief(ctx, c);
  assert.ok(b.now.some((s) => /Send the CMA/.test(s.text)));
  assert.ok(b.now.some((s) => /21 days/.test(s.text)));
  assert.ok(b.soon.length && b.later.length);
});
