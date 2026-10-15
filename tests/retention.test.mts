// Old message traffic is cleared; contacts, events, tasks and open drafts are never touched.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { purgeOld } from "../src/lib/retention.ts";

test("purgeOld removes month-old emails and finished drafts but keeps contacts and pending drafts", async () => {
  const a = await newAgent({ now: new Date(), tz: "America/New_York", seed: false });
  const c = await store.insert("contacts", a.id, { name: "Old Friend", email: null, phone: null, type: "lead", status: "new", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#fff" } as never);
  const old = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const em = await store.insert("emails", a.id, { contact_id: c.id, direction: "out", subject: "old", snippet: "", external_id: null, occurred_at: old } as never);
  const dr = await store.insert("email_drafts", a.id, { contact_id: c.id, to_contact_ids: [c.id], to_emails: [], subject: "sent long ago", body: "x", status: "sent", workflow_run_id: null, property_id: null, event_id: null, stale: false, stale_reason: null, gmail_message_id: null, sent_at: old } as never);
  const pending = await store.insert("email_drafts", a.id, { contact_id: c.id, to_contact_ids: [c.id], to_emails: [], subject: "still waiting", body: "x", status: "pending_approval", workflow_run_id: null, property_id: null, event_id: null, stale: false, stale_reason: null, gmail_message_id: null, sent_at: null } as never);
  // age the rows (the store stamps created_at on insert)
  for (const [t, id] of [["emails", em.id], ["email_drafts", dr.id], ["email_drafts", pending.id]] as const) await store.update(t as never, a.id, id, { created_at: old } as never);
  await purgeOld();
  assert.equal(await store.get("emails", a.id, em.id), null);
  assert.equal(await store.get("email_drafts", a.id, dr.id), null);
  assert.ok(await store.get("email_drafts", a.id, pending.id), "a draft still waiting on the person stays");
  assert.ok(await store.get("contacts", a.id, c.id), "contacts are never purged");
});
