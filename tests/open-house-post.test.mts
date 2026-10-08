// Bug report: "create an open house post for this address" kept asking "who is it for". An address plus "open house" is a post for that property.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, blocks } from "./qa/harness.mts";

const now = new Date("2026-10-08T14:00:00Z");
const PHRASES = [
  "Create an open house post for 412 Cypress Creek Road Wimberley TX 78676",
  "open house post for 412 Cypress Creek Rd Wimberley TX",
  "412 Cypress Creek Rd Wimberley TX open house",
  "412 Cypress Creek Rd Wimberley TX open house post",
  "post for the open house at 412 Cypress Creek Rd",
  "make an instagram post for the open house at 1227 Main St",
  "Can you do an open house instagram carousel for 88 Oak Lane Austin TX",
];

for (const p of PHRASES) {
  test(`open house post, no question loop: ${p}`, async () => {
    const a = await newAgent({ now, tz: "America/New_York", seed: true });
    const res = await a.say(p);
    assert.ok(blocks(res, "draft_social")[0], res.milaMessage.content);
    assert.doesNotMatch(res.milaMessage.content, /who is|who's|which property/i);
    const post = blocks(res, "draft_social")[0] as any;
    assert.match(post.caption, /open house/i);
  });
}

test("an open house post asks for the day and time, then books it", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: true });
  await a.say("open house post for 412 Cypress Creek Rd Wimberley TX");
  const res = await a.say("Saturday 1 to 4");
  assert.doesNotMatch(res.milaMessage.content, /not sure how to do that/i);
  assert.match(res.milaMessage.content, /open house/i);
  assert.ok(blocks(res, "workflow")[0] || blocks(res, "event_card")[0] || /saturday/i.test(res.milaMessage.content), res.milaMessage.content);
});
