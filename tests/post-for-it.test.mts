// "Make me a post for it" after adding a showing must use THAT property, not another open house on the calendar.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, blocks } from "./qa/harness.mts";

test("'post for it' follows the showing just added", async () => {
  const a = await newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/New_York", seed: true });
  await a.say("Showing at 1227 Main Street tmr at 2pm");
  const res = await a.say("Make me a instagram post for it");
  const post = blocks(res, "draft_social")[0] as any;
  assert.ok(post, res.milaMessage.content);
  assert.match(res.milaMessage.content, /1227 Main Street/);
  assert.match(post.caption, /1227 Main Street/);
  assert.doesNotMatch(post.caption, /Coachmans|Open House/i);
});
