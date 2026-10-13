import test from "node:test";
import assert from "node:assert/strict";
import { cleanForSpeech, speechCostUsd } from "../src/lib/voice.ts";

test("spoken text drops markup, links and emoji and ends on a sentence", () => {
  assert.equal(cleanForSpeech("✅ **Booked** your showing at https://x.com/a for _Friday_ at 2 PM."), "Booked your showing at for Friday at 2 PM.");
  const long = "First sentence here. ".repeat(60);
  const out = cleanForSpeech(long, 120);
  assert.ok(out.length <= 121 && out.endsWith("."), out);
  assert.equal(cleanForSpeech("   "), "");
});

test("speech cost is small but never zero", () => {
  assert.ok(speechCostUsd(500) > 0.005 && speechCostUsd(500) < 0.02);
  assert.ok(speechCostUsd(1) > 0);
});
