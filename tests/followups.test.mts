// Suggested follow-ups appear only where they follow from the answer, and every suggestion is something Mila really answers.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent } from "./qa/harness.mts";
import { followUpBlock } from "../src/lib/agent/followups.ts";

const NOW = new Date("2026-10-15T15:00:00Z");

test("follow-ups are skipped when the answer already asks something or has buttons", () => {
  const text = "Here is your week. You have three showings on Friday.";
  assert.ok(followUpBlock("agenda", [], text));
  assert.equal(followUpBlock("agenda", [], "Which one should I move?"), null);
  assert.equal(followUpBlock("agenda", [{ type: "choice", title: "x", buttons: [] }], text), null);
  assert.equal(followUpBlock("smalltalk", [], text), null);
  assert.equal(followUpBlock("agenda", [], "Done."), null);
});

for (const phrase of ["How does my week look?", "Who should I follow up with?", "What am I missing?", "Set up an open house"]) {
  test(`Mila answers the suggestion “${phrase}” properly`, async () => {
    const a = await newAgent({ now: NOW, tz: "America/New_York", seed: true });
    const r = await a.say(phrase);
    const text = typeof r === "string" ? r : (r as { milaMessage?: { content?: string } })?.milaMessage?.content ?? a.log.at(-1) ?? "";
    assert.ok(text.length > 15, `reply was: ${text}`);
    assert.doesNotMatch(text, /something went wrong|couldn't understand|I'm not sure what you mean/i);
  });
}
