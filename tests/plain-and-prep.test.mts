import test from "node:test";
import assert from "node:assert/strict";
import { plainText } from "../src/lib/agent/plain.ts";
import { fixTypos, detectIntent } from "../src/lib/agent/intents.ts";
import { splitClauses } from "../src/lib/agent/nlu.ts";

test("model markdown is flattened to clean plain text", () => {
  const out = plainText("### Showing Preparation\n\n**Date:** Tomorrow\n\n- **Property Details:**\n  - Confirm the *listing* info\n\n---\nSee [the page](https://x.com/a).");
  assert.doesNotMatch(out, /[#*`]|\*\*/);
  assert.match(out, /^Showing Preparation/);
  assert.match(out, /• Property Details:/);
  assert.match(out, /the page \(https:\/\/x\.com\/a\)/);
});

test("phone typos still route, and 'get me prepared' becomes its own request", () => {
  const t = fixTypos("I have an showinge at 1227 Main Street Gaithersburg for the turner family. They went to see it tmr at 2pm. Get me prepared for it");
  assert.match(t, /^I have a showing at/);
  assert.equal(detectIntent(t).intent, "create_event");
  assert.equal(splitClauses(t).length, 2);
  assert.equal(fixTypos("they went to see it yesterday"), "they went to see it yesterday");
});
