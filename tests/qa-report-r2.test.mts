// Regression tests for the Oct 22 Grok round-2 QA report (R2-xxx).
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const now = new Date("2026-10-22T16:00:00Z");
const tz = "America/New_York";
const fresh = () => newAgent({ now, tz, seed: false });
const C = (a: any, name: string, o: any = {}) => store.insert("contacts", a.id, { name, email: null, phone: null, type: "buyer", status: "active", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#888", ...o });

test("R2-065/073: a long paste of notes is never merged into one reminder", async () => {
  const a = await fresh();
  await C(a, "QA TEST Victor Lindqvist"); await C(a, "QA TEST Zoe Park");
  const r = await a.say("Notes from today: Met Victor Lindqvist about listing 22 QA Test Road, he wants to list at $650k. Ana Kowalczyk needs a rental near Bethesda Metro under $2,400, moving December 1. Remind me Monday at 9 to send Victor the comps. Also call Zoe Park on Thursday about her pre-approval.");
  const rem = await store.list("reminders", a.id);
  assert.equal(rem.length, 1);
  assert.equal(rem[0].title, "Send Victor the comps");
  assert.match(r.milaMessage.content, /Noted, not acted on/);
  assert.ok(r.milaMessage.blocks.some((b: any) => b.type === "workflow"), "shows a done / needs-you checklist");
});

test("R2: descriptive sentences in a paste never edit a property or book anything", async () => {
  const a = await fresh();
  await store.insert("properties", a.id, { address: "22 QA Test Road", city: "Gaithersburg", state: "MD", zip: "20877", list_price: 500000, beds: 3, baths: 2, sqft: 1800, verified: true });
  await a.say("Notes from today: Met Victor about listing 22 QA Test Road, he wants to list at $650k. Ana needs a rental near Bethesda Metro under $2,400, moving December 1. Remind me Monday at 9 to send comps.");
  const p = (await store.list("properties", a.id))[0];
  assert.equal(p.list_price, 500000);
});

test("R2: a single question listing phone, email and budget stays one request", async () => {
  const a = await fresh();
  await C(a, "QA TEST Victor Lindqvist", { phone: "301-555-0122", email: "v@example.com" });
  const r = await a.say("What's Victor's phone, email and budget?");
  assert.match(r.milaMessage.content, /301|555-0122/);
  assert.equal((await store.list("drafts", a.id).catch(() => [])).length, 0);
});

test("R2: a price-reduction email has a real body and subject, not the request echoed", async () => {
  const a = await fresh();
  await C(a, "QA TEST Victor Lindqvist", { email: "v@example.com", type: "seller" });
  await a.say("Draft an email to Victor about a price reduction on 44 QA Test Circle from $700,000 to $675,000");
  const d = (await store.list("email_drafts", a.id))[0];
  assert.ok(d, "a draft exists");
  assert.match(d.body, /3\.6%/);
  assert.match(d.subject, /Price (?:update|reduction)/);
  assert.doesNotMatch(d.body, /draft an email/i);
});

test("launch-eve: 'I got a new lead from Zillow, Name, wants...' adds a lead, not a listing", async () => {
  const a = await fresh();
  const r = await a.say("I got a new lead from Zillow, Priya Shah, wants 3 bed under 700k in Germantown, her number is 301-555-0166");
  assert.doesNotMatch(r.milaMessage.content, /new listing/i);
  const c = (await store.list("contacts", a.id))[0];
  assert.equal(c.name, "Priya Shah");
  assert.equal(c.budget_max, 700000);
  assert.match(String(c.phone), /555-0166/);
});

test("launch-eve: 'payment 550k 20% 6.5' uses the 6.5 rate", async () => {
  const a = await fresh();
  const r = await a.say("payment 550k 20% 6.5");
  assert.match(r.milaMessage.content, /6\.5% for 30 years/);
  assert.match(r.milaMessage.content, /\$2,781\/month/);
});

test("launch-eve: 'block off friday afternoon' holds 1 to 5 PM, not the whole day as out of office", async () => {
  const a = await fresh();
  await a.say("block off friday afternoon");
  const ev = await store.list("calendar_events", a.id);
  assert.equal(ev.length, 1);
  assert.equal((new Date(ev[0].end_at).getTime() - new Date(ev[0].start_at).getTime()) / 3_600_000, 4);
  assert.doesNotMatch(String(ev[0].title), /out of office/i);
});

test("launch-eve: a question about what to SAY on HOA is not answered with 'I don't have that figure'", async () => {
  const a = await fresh();
  const r = await a.say("what is a good response when a buyer asks about HOA");
  assert.doesNotMatch(r.milaMessage.content, /don't have that figure/);
});
