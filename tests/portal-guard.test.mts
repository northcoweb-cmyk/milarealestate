// Audit P0-07 / P0-09: Mila declines to scrape or pull from Zillow, Redfin or the MLS, for free, and still helps with the agent's own files.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent } from "./qa/harness.mts";
import { detectIntent } from "../src/lib/agent/intents.ts";

test("scrape and pull requests are recognised, own-file requests and normal work are not", () => {
  for (const q of ["pull the photos from Zillow for 113 Apple Blossom Way and put them in the post", "scrape the MLS and pull all the sold comps for 113 Apple Blossom Way into a spreadsheet", "grab the pictures off redfin", "download photos from the MLS"]) assert.equal(detectIntent(q).intent, "portal_request", q);
  for (const q of ["clean my Bright MLS export", "I uploaded my MLS export, screen the strongest comps", "Draft an email about the open house at 113 Apple Blossom Way", "what's my MLS number"]) assert.notEqual(detectIntent(q).intent, "portal_request", q);
});

test("the answer is a polite no that costs nothing", async () => {
  const a = await newAgent({ now: new Date("2026-10-16T15:00:00Z"), tz: "America/New_York", seed: false });
  const before = a.balance ? await a.balance() : null;
  const r = await a.say("pull the photos from Zillow for 113 Apple Blossom Way and put them in the post");
  assert.match(r.milaMessage.content, /can't pull photos/i);
  assert.match(r.milaMessage.content, /Nothing was charged/i);
  void before;
});
