import test from "node:test";
import assert from "node:assert/strict";
import { warmText } from "../src/lib/agent/warm.ts";
import { newAgent } from "./qa/harness.mts";

test("texts sound like a warm person wrote them", () => {
  assert.equal(warmText("Priya", "I'm running 10 minutes late.", "Sarah"), "Hi Priya! Quick heads up, I'm running about 10 minutes behind. Thank you so much for your patience, I'll see you very soon! – Sarah");
  assert.match(warmText("Tom", "need to move our showing to Friday", "Sarah"), /What other time would work well for you\?/);
  assert.match(warmText("Dana", "just checking in", "Sarah"), /No rush at all/);
  assert.match(warmText("Dana", "are you still interested in the condo?", "Sarah"), /condo\? – Sarah$/);
});
test("the text draft Mila makes uses it", async () => {
  const a = await newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });
  await a.say("New buyer Priya Shah, priya.shah@example.com, 512-555-0188, budget $450k");
  const r = await a.say("Text Priya I'm running 10 minutes late");
  assert.match(r.milaMessage.content, /Hi Priya! Quick heads up/);
});
