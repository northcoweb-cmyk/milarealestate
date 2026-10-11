// P0: an approval authorizes exactly what the agent was shown. Editing the draft/post/event afterwards voids that approval.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const tz = "America/New_York";
const NOW = new Date("2026-10-12T14:00:00Z");
const fresh = () => newAgent({ now: NOW, tz, seed: false });
const draftApproval = async (a: any) => {
  await a.say("New buyer Priya Shah priya@example.com");
  const r = await a.say("email Priya about the Oak Street showing");
  const draft = (await store.list("email_drafts", a.id))[0];
  const ap = (await store.list("approvals", a.id)).find((x: any) => x.payload.tool === "send_email" && x.status === "pending");
  assert.ok(draft && ap, "a draft and a pending approval exist");
  return { draft, ap, r };
};

test("editing the email body after the approval was created voids it: nothing is sent or handed off as approved", async () => {
  const a = await fresh();
  const { draft, ap } = await draftApproval(a);
  assert.ok(ap.payload.bind, "the approval snapshots what was shown");
  await store.update("email_drafts", a.id, draft.id, { body: "Totally different text the agent never saw." });
  const out = await a.act({ type: "approve", id: ap.id });
  assert.match(out.milaMessage.content, /changed after you were shown it/i);
  const after = await store.get("approvals", a.id, ap.id);
  assert.equal(after.status, "failed");
  assert.notEqual((await store.get("email_drafts", a.id, draft.id)).status, "sent");
});

test("editing the recipient after the approval was created voids it", async () => {
  const a = await fresh();
  const { draft, ap } = await draftApproval(a);
  await store.update("email_drafts", a.id, draft.id, { to_emails: ["someone-else@example.com"], to_contact_ids: [] });
  const out = await a.act({ type: "approve", id: ap.id });
  assert.match(out.milaMessage.content, /changed after you were shown it/i);
});

test("an unchanged approval still works, and a legacy approval without a snapshot keeps working", async () => {
  const a = await fresh();
  const { ap } = await draftApproval(a);
  const ok = await a.act({ type: "approve", id: ap.id });
  assert.doesNotMatch(ok.milaMessage.content, /changed after you were shown it/i);
  const b = await fresh();
  const legacy = await draftApproval(b);
  await store.update("approvals", b.id, legacy.ap.id, { payload: { tool: legacy.ap.payload.tool, args: legacy.ap.payload.args } });
  await store.update("email_drafts", b.id, legacy.draft.id, { body: "edited, but this approval predates snapshots" });
  const out = await b.act({ type: "approve", id: legacy.ap.id });
  assert.doesNotMatch(out.milaMessage.content, /changed after you were shown it/i);
});

test("an event moved after a move approval was created voids that approval", async () => {
  const a = await fresh();
  await a.say("showing at 12 Oak Lane Arlington VA Saturday at 2pm with Dana");
  const ev = (await store.list("calendar_events", a.id))[0];
  const r = await a.say("cancel the showing");
  const conf = r.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => b.approvalId);
  await store.update("calendar_events", a.id, ev.id, { start_at: new Date(new Date(ev.start_at).getTime() + 3_600_000).toISOString(), end_at: new Date(new Date(ev.end_at).getTime() + 3_600_000).toISOString() });
  const out = await a.act({ type: "approve", id: conf.approvalId });
  assert.match(out.milaMessage.content, /changed after you were shown it/i);
  assert.equal((await store.get("calendar_events", a.id, ev.id)).status, "confirmed", "nothing was canceled");
});
