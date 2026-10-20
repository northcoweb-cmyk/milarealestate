import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const now = new Date("2026-10-19T19:00:00Z");
const P = (a: any, address: string, o: any = {}) => store.insert("properties", a.id, { address, city: "Potomac", state: "MD", zip: "20854", list_price: 1475000, beds: 5, baths: 4, sqft: 4800, verified: true, ...o });
const posts = async (a: any) => (await store.list("social_posts", a.id)) as any[];

test("W9: a Coming Soon request makes a Coming Soon post: no 'Just Listed', no price", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await P(a, "14 Chestnut Hill Court");
  const r = await a.say("Make a Coming Soon post for 14 Chestnut Hill Court.");
  const p = (await posts(a))[0];
  assert.equal(p.category, "coming_soon");
  assert.match(p.caption, /Coming Soon/); assert.doesNotMatch(p.caption, /Just Listed|Offered at|\$/);
  assert.match(r.milaMessage.content, /Coming Soon post/);
});

test("W9: a home-anniversary post thanks the clients by first name and is never a listing", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await P(a, "14 Chestnut Hill Court");
  await store.insert("contacts", a.id, { name: "Maria Ferreira", email: null, phone: null, type: "past_client", status: "active", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#888" });
  await a.say("Make an Instagram home-anniversary post for the Ferreiras");
  const p = (await posts(a)).find((x: any) => x.category === "anniversary");
  assert.ok(p); assert.match(p.caption, /Happy Home Anniversary, Maria/); assert.doesNotMatch(p.caption, /Ferreira\b|Just Listed|Chestnut/);
});

test("W9: 'Just Listed' on a home saved as under contract carries a warning", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const prop = await P(a, "9 Muddy Branch Road");
  await store.insert("memories", a.id, { scope: "property", subject_id: prop.id, key: "Stage", value: "under_contract", source: "user_stated", confidence: 1 } as any);
  const r = await a.say("Make a Just Listed post for 9 Muddy Branch Road");
  assert.ok(r.milaMessage.blocks.some((b: any) => b.type === "notice" && /under contract/.test(b.body)));
});

test("W9: rewrite 'w/o the price and beds' edits the same post; headline change and another version work", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await P(a, "77 Kentlands Square", { list_price: 600000, beds: 3, baths: 2, sqft: 1800 });
  await a.say("Make a Just Listed post for 77 Kentlands Square");
  assert.equal((await posts(a)).length, 1);
  await a.say("rewrite the post w/o the price and beds");
  const p = (await posts(a))[0];
  assert.doesNotMatch(p.caption, /\$600,000|3 bed/); assert.equal((await posts(a)).length, 1);
  await a.say("make another version");
  const all = await posts(a);
  assert.equal(all.length, 2);
  assert.notEqual(all[0].caption.split("\n")[0], all[1].caption.split("\n")[0]);
});

test("W9: a listing description and flyer copy come from saved facts", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await P(a, "14 Chestnut Hill Court");
  assert.match((await a.say("Write a listing description for 14 Chestnut Hill Court.")).milaMessage.content, /5 bedrooms/);
  assert.match((await a.say("Make a flyer for 14 Chestnut Hill Court.")).milaMessage.content, /14 CHESTNUT HILL COURT/);
});
