// From running round 2: typed properties, couples, pronouns, script follow-ups, "the Tillery house".
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent } from "./qa/harness.mts";

const mk = () => newAgent({ now: new Date("2026-10-09T14:00:00Z"), tz: "America/Chicago", seed: false });

test("'Add a retail space / office / warehouse / the Alamo at <address>' saves a property of that kind", async () => {
  const a = await mk();
  const r1 = (await a.say("Add a retail space at 11410 Century Oaks Terrace, Austin, TX 78758, about 2,400 sq ft, for lease.")).milaMessage.content;
  assert.match(r1, / is saved/); assert.match(r1, /Retail space/);
  assert.match((await a.say("Add an office at 401 Congress Ave, Austin, TX 78701, 5,000 sq ft, for lease.")).milaMessage.content, /Office space/);
  assert.match((await a.say("Add the Alamo, 300 Alamo Plaza, San Antonio, TX 78205, for sale at $1.5M.")).milaMessage.content, / is saved/);
});

test("'Add a warehouse … What's missing?' saves it and then answers for THAT property", async () => {
  const a = await mk();
  const r = (await a.say("Add a warehouse at 2400 E Cesar Chavez St, Austin, TX 78702, 18,000 sq ft, asking $14 a sq ft. What's missing?")).milaMessage.content;
  assert.match(r, /2400 E Cesar Chavez/);
});

test("'Add a couple, Jordan and Kris Lee' saves a household", async () => {
  const a = await mk();
  assert.match((await a.say("Add a couple, Jordan and Kris Lee, 512-555-0134, budget $850k, looking in Georgetown. They have two kids and need a yard.")).milaMessage.content, /Jordan & Kris Lee is set up|Jordan and Kris Lee is set up/);
});

test("'Email him …' goes to the person we were just talking about, not a street in the sentence", async () => {
  const a = await mk();
  await a.say("New buyer Marcus Bell, 512-555-0167, budget $600k to $650k");
  const r = (await a.say("Email him the homes we saw this week. He really liked the one on Rivers Edge.")).milaMessage.content;
  assert.doesNotMatch(r, /I don't have Rivers Edge/);
  assert.match(r, /draft for Marcus/);
});

test("'Phone call, and keep it short' finishes a script request", async () => {
  const a = await mk();
  assert.match((await a.say("Give me a script for a buyer whose offer is $15k under asking")).milaMessage.content, /what kind of script/i);
  const r = (await a.say("Phone call, and keep it short.")).milaMessage.content;
  assert.doesNotMatch(r, /what kind of script/i); // it is the answer, so she writes the script (needs the AI service in production) instead of asking again
});

test("'Actually the Tillery house has 4 bedrooms, not 3' updates that listing", async () => {
  const a = await mk();
  await a.say("New seller Helen Ortiz, 512-555-0123, listing 2207 Tillery St, Austin, TX 78702 next month");
  await a.say("Add a listing at 2207 Tillery St, Austin, TX 78702, 3 bed 2 bath, $500,000");
  assert.match((await a.say("Actually the Tillery house has 4 bedrooms, not 3.")).milaMessage.content, /Updated 2207 Tillery/);
});
