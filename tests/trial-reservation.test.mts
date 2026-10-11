// Trial pool: each admitted user's promised allowance is reserved at admission. The pool stops NEW admissions; it never switches off an admitted user.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { trialAdmissionOpen, assertAiBudget, resetAiBudgetMemo, runInAiScope } from "../src/lib/ai/budget.ts";

const NOW = new Date("2026-10-12T14:00:00Z");

test("admission closes when the promised allowances would exceed the pool, and existing users keep theirs", async () => {
  process.env.MILA_TRIAL_POOL_USD = "1.6"; // room for two reservations (0.75 each), not three
  resetAiBudgetMemo();
  const a = await newAgent({ now: NOW, tz: "America/New_York", seed: false });
  const b = await newAgent({ now: NOW, tz: "America/New_York", seed: false });
  for (const u of [a, b]) await store.insert("subscriptions", u.id, { plan_key: "trial", status: "trial", period_start: NOW.toISOString(), period_end: new Date(NOW.getTime() + 7 * 86_400_000).toISOString() } as never).catch(() => undefined);
  const seat = await trialAdmissionOpen();
  assert.ok(seat.admitted >= 2);
  assert.equal(seat.open, false, "no third reservation fits");
  // user a spends a lot (someone else's usage is irrelevant to b): b is still allowed within their own allowance
  await store.insert("usage", a.id, { conversation_id: null, operation: "chat", tier: "fast", provider: "x", model: "x", input_units: 1, output_units: 1, est_cost_usd: 0.4, credits: 1 } as never);
  resetAiBudgetMemo();
  await runInAiScope(b.id, async () => { await assertAiBudget({ tier: "fast", inputChars: 100 }); });
  delete process.env.MILA_TRIAL_POOL_USD;
});
