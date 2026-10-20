import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const now = new Date("2026-10-19T19:00:00Z");
const say = async (a: any, t: string) => (await a.say(t)).milaMessage.content as string;
const prop = (a: any, address: string) => store.insert("properties", a.id, { address, city: "Gaithersburg", state: "MD", zip: "20877", list_price: 500000, beds: 3, baths: 2, sqft: 1800, verified: true });

test("W6: status words are saved on the named home", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await prop(a, "77 Kentlands Boulevard");
  assert.match(await say(a, "Mark Kentlands as coming soon"), /Marked 77 Kentlands Boulevard as Coming soon/);
});

test("W6: an offer on a saved home is logged on that home with a to-do", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await prop(a, "77 Kentlands Boulevard");
  assert.match(await say(a, "We got an offer on 77 Kentlands Boulevard for $490,000"), /Logged on 77 Kentlands Boulevard/);
  assert.ok((await store.list("tasks", a.id)).some((t: any) => /Respond to the offer/.test(t.title)));
});

test("W6: a street name alone resolves to the saved home", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await prop(a, "77 Kentlands Boulevard");
  assert.doesNotMatch(await say(a, "Tell me about Kentlands"), /anyone named/);
});
