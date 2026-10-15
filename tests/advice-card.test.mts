// A long how-to answer becomes one clean row per step, and open-house answers offer things Mila can do.
import test from "node:test";
import assert from "node:assert/strict";
import { adviceCard } from "../src/lib/agent/engine.ts";
import { detectIntent } from "../src/lib/agent/intents.ts";

const ANSWER = `🏠 Let's get your open house buttoned up. I'm assuming you mean 2201 Barton Springs Road.

✅ Confirm the time, access instructions, parking, and that the seller approved the event.
✅ Check the listing facts against the approved MLS sheet: price, beds/baths, features, and disclosures.
✅ Ask the seller to secure valuables, medications, firearms, personal documents, and pets.
✅ Bring sign-in sheets, property flyers, business cards, shoe covers, and signs.
✅ Arrive early to unlock, turn on lights, open blinds, and walk the home for safety issues.
✅ Afterward, secure the home, lock up, and follow up with visitors.`;

test("an emoji checklist becomes one row per line with no leftover check marks", () => {
  const c = adviceCard("prep my open house", ANSWER);
  assert.ok(c);
  assert.equal(c!.block.type, "advice");
  if (c!.block.type !== "advice") return;
  assert.equal(c!.block.steps.length, 6);
  assert.ok(c!.block.steps.every((s) => !/✅/.test(s.body)));
  assert.equal(c!.block.title, "Open house checklist");
});

test("open-house advice offers real actions, tied to the address", () => {
  const c = adviceCard("prep my open house", ANSWER)!;
  if (c.block.type !== "advice") return;
  const prompts = (c.block.buttons ?? []).map((b) => (b.action && b.action.type === "prompt" ? b.action.text : ""));
  assert.equal(prompts.length, 3);
  assert.ok(prompts.every((p) => p.includes("2201 Barton Springs Road")));
  assert.deepEqual(prompts.map((p) => detectIntent(p).intent), ["prep_property", "social_post", "draft_email"]);
});

test("short answers stay plain text", () => {
  assert.equal(adviceCard("hi", "Sure, anytime."), null);
});
