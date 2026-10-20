import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const now = new Date("2026-10-19T15:00:00Z");
const say = async (a: any, t: string) => (await a.say(t)).milaMessage.content as string;
const mk = (a: any, name: string, o: any = {}) => store.insert("contacts", a.id, { name, email: null, phone: null, type: "buyer", status: "active", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#888", ...o });
const names = async (a: any) => (await store.list("contacts", a.id)).map((c: any) => c.name);

test("W1: ordinary words are never saved as a person (Agent, Credit, Profile, The)", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await mk(a, "Dana Reyes");
  assert.match(await say(a, "I got a referral from Dana Reyes, her coworker is moving to Olney and needs a buyer agent"), /What's their name/);
  assert.match(await say(a, "Joaquin Mbeki"), /Joaquin Mbeki is set up/);
  await say(a, "add a note to 77 kentlands square: got a 590k offer w 10k seller credit");
  assert.deepEqual((await names(a)).sort(), ["Dana Reyes", "Joaquin Mbeki"]);
});

test("W1: households, bare names, hyphenated names, related contacts", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  assert.match(await say(a, "Add a new lead: the Lutz family, buyers, two kids and need a fenced yard"), /Lutz Family is set up/);
  assert.match(await say(a, "Add Tomas Ferreira"), /Tomas Ferreira is set up/);
  await mk(a, "Corinne Abernathy-Wolfe", { type: "seller" });
  assert.match(await say(a, "Add Grant Abernathy as a related contact for Corinne."), /Added Grant Abernathy, linked to Corinne/);
  assert.match(await say(a, "Hannah Cole lives in Potomac. She is a widow, so add her as a seller."), /Hannah Cole is set up/);
});

test("W1: a typed full name never updates a different person who shares the first name", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const dana = await mk(a, "Dana Reyes", { phone: "(512) 555-0199" });
  const out = await say(a, "Update QA TEST Dana Lee phone to 301-555-0199");
  assert.doesNotMatch(out, /Updated/);
  assert.equal((await store.get("contacts", a.id, dana.id)).phone, "(512) 555-0199");
});

test("W2: facts save only for the person the sentence is about, as clean fields", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const dana = await mk(a, "Dana Reyes");
  const mari = await mk(a, "Marisol Treviño", { budget_max: 600000 });
  await say(a, "I got a referral from Dana Reyes, her coworker is moving to Olney");
  await say(a, "that draft is too generic. rewrite it to say Dana Reyes referred him and I would love to meet Tuesday at 3pm");
  const mems = (await store.list("memories", a.id)).filter((m: any) => m.subject_id === dana.id);
  assert.equal(mems.length, 0, JSON.stringify(mems));
  await say(a, "marisol trevino updated her budget, now up to 625k and she wants 4br min");
  assert.equal((await store.get("contacts", a.id, mari.id)).budget_max, 625000);
  const mm = (await store.list("memories", a.id)).filter((m: any) => m.subject_id === mari.id && m.key === "Budget");
  assert.equal(mm[0].value, "$625,000");
});

test("W2: a role statement sets the type and an offer is recorded cleanly", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const kim = await mk(a, "Dave & Linda Kim");
  assert.match(await say(a, "Dave & Linda Kim are the sellers"), /saved as a seller/);
  assert.equal((await store.get("contacts", a.id, kim.id)).type, "seller");
  const h = await mk(a, "Hollis Brandt", { type: "seller" });
  assert.match(await say(a, "Hollis and Mae just got an offer on Bellemeade Court for $640k"), /Offer received: \$640,000/);
  void h;
});
