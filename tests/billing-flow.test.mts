// Trial lock, purchase credits arriving once and instantly, and big AI use costing more credits.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { applyCheckoutSession } from "../src/lib/billing/apply-checkout.ts";
import { ensureCredits, getBalance, TrialEnded, creditsForAiCost, takeTurnAiCost, recordUsage, AI_USD_PER_CREDIT } from "../src/lib/credits.ts";

const NOW = new Date("2026-10-12T14:00:00Z");

async function trialUser(daysAgoStart: number) {
  const u = await newAgent({ now: NOW, tz: "America/New_York", seed: false });
  const start = new Date(Date.now() - daysAgoStart * 86_400_000);
  const row = { plan_key: "trial", status: "trial" as const, credits_per_period: 100, period_start: start.toISOString(), period_end: new Date(start.getTime() + 7 * 86_400_000).toISOString(), stripe_customer_id: null, stripe_subscription_id: null };
  const existing = (await store.list("subscriptions", u.id))[0];
  if (existing) await store.update("subscriptions", u.id, existing.id, row); else await store.insert("subscriptions", u.id, row);
  const have = await getBalance(u.id); if (have) await store.insert("credit_transactions", u.id, { kind: "adjust", delta: -have, balance_after: 0, reason: "test reset", usage_id: null });
  await store.insert("credit_transactions", u.id, { kind: "grant", delta: 100, balance_after: 100, reason: "7-day free trial", usage_id: null });
  return u;
}

test("trial: works during the 7 days, locks after, and a purchase unlocks it", async () => {
  const live = await trialUser(2);
  await ensureCredits(live.id, 1); // fine
  const ended = await trialUser(8);
  await assert.rejects(() => ensureCredits(ended.id, 1), TrialEnded);
  const r = await applyCheckoutSession(ended.id, { id: "cs_test_unlock1", customer: "cus_1", subscription: "sub_1", metadata: { kind: "plan", plan_key: "pro" } });
  assert.equal(r.applied, true);
  assert.equal(await getBalance(ended.id), 1200);
  await ensureCredits(ended.id, 1); // no longer locked
});

test("a pack grants its credits once, even if the webhook and the return page both fire", async () => {
  const u = await trialUser(1);
  const before = await getBalance(u.id);
  const s = { id: "cs_test_pack1", metadata: { kind: "pack", credits: "500" } };
  const a = await applyCheckoutSession(u.id, s), b = await applyCheckoutSession(u.id, s);
  assert.equal(a.applied, true); assert.equal(b.applied, false);
  assert.equal(await getBalance(u.id), before + 500);
});

test("annual plan: monthly allowance plus the one-time perk, applied once", async () => {
  const u = await trialUser(1);
  const s = { id: "cs_test_annual1", customer: "cus_2", subscription: "sub_2", metadata: { kind: "plan", plan_key: "pro_annual" } };
  await applyCheckoutSession(u.id, s); await applyCheckoutSession(u.id, s);
  assert.equal(await getBalance(u.id), 1200 + 500);
});

test("a turn that used a lot of AI costs more credits than a small one", async () => {
  const u = await trialUser(1);
  takeTurnAiCost(u.id);
  await recordUsage({ userId: u.id, operation: "chat", creditKey: "chat_simple", creditsOverride: 0, tier: "reasoning", estCostUsd: 0.004 });
  assert.equal(creditsForAiCost(takeTurnAiCost(u.id)), 1);
  await recordUsage({ userId: u.id, operation: "chat", creditKey: "chat_simple", creditsOverride: 0, tier: "reasoning", estCostUsd: 0.045 });
  assert.equal(creditsForAiCost(takeTurnAiCost(u.id)), 5);
  assert.equal(AI_USD_PER_CREDIT, 0.01);
  assert.equal(takeTurnAiCost(u.id), 0, "reading resets it");
});

test("extras (top-ups, bonuses) survive the monthly reset; unused plan credits don't stack", async () => {
  const { creditBuckets, planRefillAmount, grantCredits, recordUsage } = await import("../src/lib/credits.ts");
  const u = await trialUser(1);
  await applyCheckoutSession(u.id, { id: "cs_test_extras1", customer: "c", subscription: "s", amount_total: 3900, metadata: { kind: "plan", plan_key: "pro" } });
  await applyCheckoutSession(u.id, { id: "cs_test_pack_x", metadata: { kind: "pack", credits: "500" } }); // 500 extra
  const sub = (await store.list("subscriptions", u.id))[0];
  let b = await creditBuckets(u.id, sub);
  assert.deepEqual([b.plan, b.extra], [1200, 500]);
  await recordUsage({ userId: u.id, operation: "x", creditKey: "chat_simple", creditsOverride: 300 }); // plan credits go first
  b = await creditBuckets(u.id, sub);
  assert.deepEqual([b.plan, b.extra], [900, 500]);
  assert.equal(await planRefillAmount(u.id, sub), 300, "only what was spent comes back");
  await grantCredits(u.id, await planRefillAmount(u.id, sub), "reset", "Monthly reset (test)");
  const b2 = await creditBuckets(u.id, { ...sub, period_start: new Date(Date.now() + 1000).toISOString() });
  assert.equal(b2.balance, 1700, "back to the allowance plus the untouched extras");
});
