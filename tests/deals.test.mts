// The everyday real-estate workflows: offer accepted → timeline, closed deal, logging calls, texts, week + pipeline views.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, blocks, store } from "./qa/harness.mts";
import { partsIn } from "../src/lib/time.ts";

const now = new Date("2026-10-05T14:00:00Z"); // Mon 10:00 ET
const tz = "America/New_York";
const fresh = () => newAgent({ now, tz, seed: false });
const say = async (a: any, m: string) => (await a.say(m)).milaMessage.content as string;

test("offer accepted builds the whole timeline from the dates given, estimating only what's missing", async () => {
  const a = await fresh();
  const out = await say(a, "Offer accepted on 123 Main Street! Closing November 20, inspection in 7 days, appraisal by the 28th, financing contingency Nov 5");
  assert.match(out, /built the timeline for 123 Main Street/);
  const ev = (await store.list("calendar_events", a.id)).filter((e: any) => e.notes === "Transaction milestone");
  const at = (label: string) => ev.find((e: any) => e.title.startsWith(label));
  const d = (e: any) => { const p = partsIn(new Date(e.start_at), tz); return `${p.m}/${p.d} ${p.h}:00`; };
  assert.equal(d(at("Closing")), "11/20 10:00");
  assert.equal(d(at("Inspection")), "10/12 9:00");
  assert.equal(d(at("Appraisal")), "10/28 9:00");
  assert.equal(d(at("Financing contingency")), "11/5 9:00");
  assert.equal(d(at("Final walkthrough")), "11/19 16:00");
  assert.match(out, /Earnest money due.*typical — confirm with your contract/, "estimated dates are labelled as estimates");
  assert.doesNotMatch(out.split("\n").find((l) => /Inspection/.test(l)) ?? "", /typical/, "stated dates are not labelled as estimates");
  assert.ok((await store.list("tasks", a.id)).filter((t: any) => t.subtitle?.startsWith("Transaction milestone")).length >= 5);
});

test("telling Mila again replaces the timeline instead of doubling it; a missing closing date is the only question", async () => {
  const a = await fresh();
  const q = await say(a, "We're under contract on 55 Pine Road");
  assert.match(q, /closing date for 55 Pine Road/i);
  await say(a, "December 4");
  const n1 = (await store.list("calendar_events", a.id)).length;
  assert.ok(n1 >= 4);
  await say(a, "Offer accepted on 55 Pine Road, closing December 11");
  const evs = await store.list("calendar_events", a.id);
  assert.equal(evs.length, n1, "no duplicates");
  assert.equal(partsIn(new Date(evs.find((e: any) => e.title.startsWith("Closing")).start_at), tz).d, 11);
});

test("closing out a deal: sold, follow-ups queued, clients saved, open deadlines cleared", async () => {
  const a = await fresh();
  await say(a, "Offer accepted on 88 Willow Court, closing October 30");
  const out = await say(a, "I closed on 88 Willow Court today, sold for 612k, buyers were the Parks");
  assert.match(out, /Congratulations on closing 88 Willow Court at \$612,000/);
  const tasks = await store.list("tasks", a.id);
  assert.equal(tasks.filter((t: any) => t.subtitle?.startsWith("Transaction milestone") && t.status === "open").length, 0);
  assert.ok(tasks.filter((t: any) => t.kind === "follow_up").length >= 4);
  assert.ok((await store.list("contacts", a.id)).some((c: any) => c.type === "past_client" && /Parks/.test(c.name)));
});

test("a client call is logged to them, facts are saved, and a follow-up is set — no scheduling quiz", async () => {
  const a = await fresh();
  const out = await say(a, "Dana Whitfield just called, she wants to see 3 houses this weekend in Bethesda under 700k");
  assert.doesNotMatch(out, /what time/i);
  assert.match(out, /Logged your call with Dana Whitfield/);
  const [c] = await store.list("contacts", a.id);
  const evs = (await store.list("contact_events", a.id)).filter((e: any) => e.contact_id === c.id && e.kind === "call");
  assert.equal(evs.length, 1);
  const t = (await store.list("tasks", a.id)).find((x: any) => x.contact_id === c.id);
  assert.ok(t && /Dana/.test(t.title));
  const out2 = await say(a, "Log a call with Dana Whitfield: she's pre-approved and I'll send her three listings tonight");
  assert.match(out2, /Logged your call with Dana Whitfield/);
  assert.equal((await store.list("contacts", a.id)).length, 1, "same person, not a duplicate");
});

test("text drafts open in the agent's own Messages app; nothing is sent by Mila", async () => {
  const a = await fresh();
  await say(a, "I have a new buyer named Dana Whitfield, phone 301-555-0142, looking for a 3 bedroom around $600k");
  const r = await a.say("Text Dana that I'll send her options tonight");
  assert.match(r.milaMessage.content, /“Hi Dana! I'll send you options tonight\. Let me know if you have any questions! – Sarah”/);
  const btn = blocks(r, "choice")[0].buttons[0];
  assert.match(btn.href, /^sms:3015550142\?&body=Hi%20Dana/);
});

test("emailing someone who isn't a contact asks, instead of using whoever came up last", async () => {
  const a = await fresh();
  await say(a, "I have a new buyer named Dana Whitfield looking for a 3 bedroom around $600k");
  const out = await say(a, "Draft a price reduction email for the Hendersons, we're dropping 15k");
  assert.match(out, /don't have Hendersons in your contacts/i);
});

test("how's my week and what's my pipeline worth answer from real data", async () => {
  const a = await fresh();
  await say(a, "Offer accepted on 123 Main Street, closing November 20");
  await say(a, "New listing at 22 Elm Court Bethesda MD, 3/2, $650k");
  await say(a, "I have a new buyer named Priya Shah looking for a 3 bedroom around $500k");
  const w = await say(a, "How's my week looking?");
  assert.match(w, /Thu Oct 8: .*Earnest money due/, "days are shown with their dates");
  const p = await say(a, "What's my pipeline worth?");
  assert.match(p, /Active listings: 1 · \$650,000 → about \$19,500/);
  assert.match(p, /Active buyers: 1/);
  const p2 = await say(a, "My commission is 2.5%");
  assert.match(p2, /about \$16,250/);
  assert.match(p2, /at 2\.5%/);
});
