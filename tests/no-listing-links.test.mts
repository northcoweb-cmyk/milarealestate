// Mila never reads listing links. A pasted link gets a clear answer that points to adding photos by hand.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

test("a pasted listing link pulls nothing and tells the agent to add photos, naming Zillow and Redfin", async () => {
  const a = await newAgent({ now: new Date("2026-10-15T15:00:00Z"), tz: "America/New_York", seed: false });
  const r = await a.say("Here's the listing for 113 Apple Blossom Way: https://www.zillow.com/homedetails/113-Apple-Blossom-Way/1_zpid/");
  const T = JSON.stringify(r.milaMessage.blocks ?? []) + r.milaMessage.content;
  assert.match(T, /Zillow/); assert.match(T, /Redfin/);
  assert.equal((await store.list("property_images", a.id)).length, 0);
  assert.ok(!/pulled|pulling/i.test(T));
});
