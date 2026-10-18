import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { scrubInternal } from "../src/lib/agent/engine";

const now = new Date("2026-10-16T15:00:00Z");
const say = async (a: any, t: string) => (await a.say(t)).milaMessage.content as string;

test("B-1: questions about a saved property answer from the record, never 'Who is it for?'", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await store.insert("properties", a.id, { address: "14 Ridge Road", city: "Gaithersburg", state: "MD", zip: "20877", list_price: 485000, beds: 3, baths: 2, sqft: 1790, verified: true });
  assert.match(await say(a, "What's the price of 14 Ridge Road?"), /\$485,000/);
  assert.match(await say(a, "How many bedrooms does 14 Ridge Road have?"), /3 bedrooms/);
  assert.match(await say(a, "what's the sqft of 14 Ridge Road"), /1,790/);
  assert.match(await say(a, "which properties are under $500,000?"), /14 Ridge Road/);
  const none = await say(a, "What's the price of 999 Nowhere Lane?");
  assert.match(none, /don't have 999 Nowhere Lane/);
  assert.doesNotMatch(none, /Who is it for/);
});

test("P0-2/3: contact details are all saved and one field can be updated", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await say(a, "Add a buyer QA TEST Morgan Tate, email morgan.tate@example.com, phone 512-555-0188, wants a 4 bed in Round Rock under 650k");
  const [c] = (await store.list("contacts", a.id)).filter((x: any) => /Morgan/.test(x.name));
  assert.equal(c.email, "morgan.tate@example.com"); assert.equal(c.phone, "(512) 555-0188"); assert.equal(c.budget_max, 650000);
  assert.match(await say(a, "Update QA TEST Morgan Tate's phone to 512-555-0299"), /Updated .*\(512\) 555-0299/);
  assert.equal((await store.get("contacts", a.id, c.id)).phone, "(512) 555-0299");
  assert.match(await say(a, "What is Morgan Tate's phone?"), /555-0299/);
});

test("P0-4/5: the ZIP and capitals the agent typed are kept", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await say(a, "add property 9 QA Test Court, Austin TX 78701");
  assert.deepEqual((await store.list("properties", a.id)).map((p: any) => [p.address, p.zip]), [["9 QA Test Court", "78701"]]);
});

test("P0-10: a wild price change is asked about, not saved", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const [p] = [await store.insert("properties", a.id, { address: "14 Ridge Road", city: "Gaithersburg", state: "MD", zip: "20877", list_price: 485000, beds: 3, baths: 2, sqft: 1790, verified: true })];
  assert.match(await say(a, "Change the price of 14 Ridge Road to 47900022"), /haven't saved it/);
  assert.equal((await store.get("properties", a.id, p.id)).list_price, 485000);
  await say(a, "Confirmed: 14 Ridge Road price is now 479000");
  assert.equal((await store.get("properties", a.id, p.id)).list_price, 479000);
});

test("P0-7: moving or canceling an event that isn't there says so", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: true });
  assert.match(await say(a, "move my QA TEST Calendar check call to 11am"), /don't see anything on your calendar/);
  assert.match(await say(a, "cancel the open house at 77 Test Lane on Friday"), /haven't canceled anything/);
});

test("P0-9: saved-rating JSON never shows in a reply", () => {
  assert.equal(scrubInternal('Sure. {"kind":"wrong","q":"The one that happened today","a":"I couldn\'t make that out,"'), "Sure.");
});

test("P0-13/14: Mila can cancel a reminder (after a tap) and a past event by title and date", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const r = await store.insert("reminders", a.id, { title: "Call QA TEST Jordan Lee", remind_at: "2026-10-17T14:00:00.000Z", channels: ["pwa"], status: "pending", contact_id: null, event_id: null, workflow_run_id: null, delivered_at: null });
  const ask = await a.say("cancel the reminder to call Jordan");
  assert.match(ask.milaMessage.content, /Remove the reminder .Call QA TEST Jordan Lee./);
  assert.equal((await store.get("reminders", a.id, r.id)).status, "pending");
  await a.act({ type: "cancel_reminder", id: r.id });
  assert.equal((await store.get("reminders", a.id, r.id)).status, "cancelled");
  const ev = await store.insert("calendar_events", a.id, { title: "QA TEST past date check", kind: "meeting", start_at: "2026-09-20T14:00:00.000Z", end_at: "2026-09-20T14:30:00.000Z", status: "confirmed", source: "mila", location: null, notes: null, contact_id: null, property_id: null, external_id: null, synced_at: null });
  const c = await say(a, "cancel QA TEST past date check on Sept 20");
  assert.match(c, /cancel QA TEST past date check/i);
  void ev;
});

test("P1: a tagged name resolves in one step, tasks keep their words, repeated post requests don't stack, rewrite edits in place", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  for (const n of ["QA TEST Jordan Lee", "QA TEST Maya Ortiz", "Priya Shah"]) await store.insert("contacts", a.id, { name: n, email: null, phone: null, type: "buyer", status: "active", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#888" });
  assert.match(await say(a, "Draft a thank-you email to QA TEST Maya after the open house"), /draft for Maya/i);
  assert.match(await say(a, "Add a task for Priya Shah: send comps"), /Send comps \(Priya\)/);
  const t = (await store.list("tasks", a.id)).find((x: any) => /Send comps/.test(x.title));
  assert.ok(t && t.contact_id);
  await store.insert("properties", a.id, { address: "14 Ridge Road", city: "Gaithersburg", state: "MD", zip: "20877", list_price: 485000, beds: 3, baths: 2, sqft: 1790, verified: true });
  await say(a, "Make a just listed post for 14 Ridge Road");
  assert.match(await say(a, "Make a just listed post for 14 Ridge Road"), /already have a just listed post/);
  assert.equal((await store.list("social_posts", a.id)).length, 1);
  const rw = await say(a, "Rewrite the 14 Ridge Road just listed post without the price and beds. Keep it short.");
  assert.match(rw, /Edited your existing post/);
  const [p] = await store.list("social_posts", a.id);
  assert.doesNotMatch(p.caption, /\$485,000|3 bed/); assert.match(p.caption, /Just Listed/);
  assert.equal((await store.list("social_posts", a.id)).length, 1);
});
