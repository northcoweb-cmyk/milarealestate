// Saving one setting must not wipe other saved things (referral code, saved orders), and unknown keys are ignored.
import test from "node:test";
import assert from "node:assert/strict";
import { mergeSettings } from "../src/lib/server/settings-merge.ts";
import { defaultSettings } from "../src/lib/defaults.ts";

test("a notification toggle merges over the saved settings and ignores unknown keys", () => {
  const cur = { ...defaultSettings(), referral: { code: "ABC123" }, task_order: ["t1"], home_order: ["a"] } as never;
  const merged = mergeSettings(cur, { notifications: { channels: { email: false } }, evil: { x: 1 } });
  assert.equal(merged.notifications.channels.email, false);
  assert.equal(merged.notifications.channels.browser, true);
  assert.ok(!("evil" in merged));
  // the route spreads the saved settings first, so nothing else is lost
  const saved = { ...(cur as object), ...merged } as Record<string, unknown>;
  assert.deepEqual(saved.referral, { code: "ABC123" });
  assert.deepEqual(saved.task_order, ["t1"]);
  assert.deepEqual(saved.home_order, ["a"]);
});
