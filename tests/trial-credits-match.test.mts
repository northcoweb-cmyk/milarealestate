// A free trial's credits and its dollar allowance run out together, so hitting the limit means being out of credits.
import test from "node:test";
import assert from "node:assert/strict";
import { store } from "./qa/harness.mts";
import { createProfile } from "../src/lib/auth.ts";
import { healNegativeBalance, creditsForAiCost, exhaustTrialCredits, getBalance, grantCredits, usdPerCredit } from "../src/lib/credits.ts";

const NOW = new Date("2026-10-12T14:00:00Z");
let n = 0;
/** a real customer (not a tester) on day 1 of a trial */
async function trialUser() {
  const p = await createProfile({ email: `customer${++n}-${Date.now()}@gmail.com`, full_name: "Real Customer" });
  const sub = (await store.list("subscriptions", p.id))[0]; // signup made a development plan; turn it into a fresh trial
  await store.update("subscriptions", p.id, sub.id, { plan_key: "trial", status: "trial", period_start: NOW.toISOString(), period_end: new Date(Date.now() + 7 * 86_400_000).toISOString(), credits_per_period: 100 } as never);
  return p;
}

test("on a trial, 100 credits equal the $0.50 AI allowance; on a plan a credit is a cent", async () => {
  const a = await trialUser();
  const per = await usdPerCredit(a.id);
  assert.ok(Math.abs(per - 0.005) < 1e-9, `trial rate ${per}`);
  assert.equal(creditsForAiCost(0.5, per), 100);
  assert.equal(creditsForAiCost(0.05, 0.01), 5);
});

test("when a trial's allowance is used up, its credits go to zero", async () => {
  const a = await trialUser();
  await grantCredits(a.id, 60, "grant", "test");
  assert.ok((await getBalance(a.id)) >= 60);
  await exhaustTrialCredits(a.id);
  assert.equal(await getBalance(a.id), 0);
});

test("a balance never stays below zero: a charge that raced the trial cap is written back as a correction", async () => {
  const a = await trialUser();
  await store.insert("credit_transactions", a.id, { kind: "spend", delta: -100000, balance_after: -50, reason: "chat", usage_id: null } as never);
  assert.ok((await getBalance(a.id)) < 0);
  await healNegativeBalance(a.id);
  assert.equal(await getBalance(a.id), 0);
});
