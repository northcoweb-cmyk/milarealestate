import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const now = new Date("2026-10-19T19:00:00Z");
const say = async (a: any, t: string) => (await a.say(t)).milaMessage.content as string;
const C = (a: any, name: string, o: any = {}) => store.insert("contacts", a.id, { name, email: null, phone: null, type: "buyer", status: "active", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#888", ...o });
const P = (a: any, address: string) => store.insert("properties", a.id, { address, city: "Gaithersburg", state: "MD", zip: "20878", list_price: 600000, beds: 3, baths: 2, sqft: 1800, verified: true });

test("W8: inbox questions are answered honestly and draft nothing", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await C(a, "Dana Lee", { email: "d@x.com" });
  assert.match(await say(a, "any new emails from leads today?"), /don't read your inbox/);
  assert.match(await say(a, "whats in my inbox"), /don't read your inbox/);
  assert.equal((await store.list("approvals", a.id)).length, 0);
});

test("W8: 'txt <name> …' is a text draft, not a calendar event; a street name becomes the full address once", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await C(a, "Tobias Reed", { phone: "240-555-0101" }); await P(a, "9 Muddy Branch Road");
  const r = await say(a, "txt tobias followup from the showing at 9 muddy branch");
  assert.match(r, /text to Tobias/); assert.doesNotMatch(r, /Road.*Road/);
  assert.equal((await store.list("calendar_events", a.id)).length, 0);
});

test("W8: one sentence of facts about one person is saved together, commas and all", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await C(a, "Naomi Achterberg", { type: "rental" });
  const r = await say(a, "Update Naomi Achterberg: max rent $3,200, near Bethesda Metro, move-in Dec 1, has a cat, phone 240-555-0142");
  assert.match(r, /Max rent: \$3,200\/month/); assert.match(r, /near Bethesda Metro/); assert.match(r, /move-in Dec 1/); assert.match(r, /cat/); assert.match(r, /555-0142/);
  const n = (await store.list("contacts", a.id))[0] as any;
  assert.equal(n.budget_max, 3200); assert.match(n.phone, /555-0142/);
});

test("W8: 'Add X as a buyer … open house' adds a person; turnout is saved; open-house follow-up email to one person is a draft", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await P(a, "77 Kentlands Square"); await C(a, "Omar Said", { email: "o@x.com" });
  assert.doesNotMatch(await say(a, "Add Brielle Haskins as a buyer. She came to the 77 Kentlands Square open house and loved the kitchen"), /Instagram/);
  assert.ok((await store.list("contacts", a.id)).some((c: any) => c.name === "Brielle Haskins"));
  assert.match(await say(a, "I had 6 people come through 77 Kentlands Square on Saturday"), /Saved: 6 visitors/);
  assert.doesNotMatch(await say(a, "Draft a follow-up email to Omar Said about the open house"), /sign-in sheet/);
});

test("W8: a correction to one field applies; 'Describe the home itself' describes from saved facts; 'I said a text' converts the draft", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await C(a, "Tobias Reed", { phone: "240-555-0101" }); await P(a, "77 Kentlands Square");
  assert.match(await say(a, "the budget field should say 625k max for Tobias Reed"), /budget to \$625,000/);
  assert.match(await say(a, "Describe the home itself"), /3 bedrooms/);
  await say(a, "Draft an email to Tobias Reed saying the photos are ready");
  assert.match(await say(a, "no i said a TEXT message not email"), /text to Tobias/);
});

test("W1 follow-ups: a couple is one household contact, plural roles work, 'Rockville., MD, MD' is cleaned, 'she is also pre-approved' goes to the person just added", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await a.say("Add Hollis and Mae Brandt as sellers, 301-555-0123");
  assert.ok((await store.list("contacts", a.id)).some((c: any) => /Hollis & Mae Brandt/.test(c.name) && c.type === "seller"));
  await a.say("Add a buyer Sam Rivera, budget 600k, looking in Rockville., MD, MD");
  const sam = (await store.list("contacts", a.id)).find((c: any) => c.name === "Sam Rivera") as any;
  assert.equal(sam.location, "Rockville, MD");
  assert.match(await say(a, "she is also pre-approved for 500k"), /Sam's profile[\s\S]*\$500,000/);
});

test("Launch-eve: a new open house with no address never reuses the last home or an old pending question; a typed address wins", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await a.say("I have an open house at 123 Main Street. Set everything up.");
  assert.match(await say(a, "setup an open house for this upcoming saturday"), /Which property/);
  assert.match(await say(a, "456 Oak Lane, Gaithersburg MD"), /What time does it start on Saturday/);
  await say(a, "1 to 4");
  const oh = (await store.list("calendar_events", a.id)).filter((e: any) => e.kind === "open_house");
  assert.equal(oh.length, 1); assert.match(oh[0].title, /456 Oak Lane/);
});
