import test from "node:test";
import assert from "node:assert/strict";
import { parseTipRequest, buildPost } from "../src/lib/content/templates.ts";

test("a count in the note makes that many tips", () => {
  const r = parseTipRequest("3 tips for first-time buyers");
  assert.deepEqual([r?.n, r?.audience, r?.own.length], [3, "first-time buyers", 0]);
  assert.equal(parseTipRequest("three tips")?.n, 3);
});
test("the agent's own wording is used first, in order", () => {
  const r = parseTipRequest("3 tips for buyers: get pre-approved before touring; walk the block at night; ask what the roof age is");
  assert.equal(r?.own.length, 3);
  const b = buildPost({ category: "buyer_tip", platform: "instagram", name: "Ry", tips: r, variant: 0 } as never);
  assert.equal(b.slides.length, 3);
  assert.match(b.slides[1].headline, /1\. get pre-approved before touring\n2\. walk the block at night\n3\. ask what the roof age is/i);
  assert.match(b.caption, /walk the block at night/i);
});
test("two own tips plus a count fills the rest from Mila's list", () => {
  const r = parseTipRequest("3 tips: get pre-approved before touring; ask about the roof age");
  const b = buildPost({ category: "buyer_tip", platform: "instagram", name: "Ry", tips: r, variant: 0 } as never);
  assert.equal(b.slides[1].headline.split("\n").length, 3);
});
test("a plain note is not a tip request", () => {
  assert.equal(parseTipRequest("mention first-time buyers"), null);
  assert.equal(parseTipRequest(""), null);
});
