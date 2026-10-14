import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { applyCheckoutSession } from "../src/lib/billing/apply-checkout.ts";
import { ensureReferralCode, recordReferral, rewardReferral, findReferrer, REFERRER_CREDITS, REFEREE_CREDITS, MAX_REWARDED_REFERRALS } from "../src/lib/referral.ts";
import { getBalance } from "../src/lib/credits.ts";

const NOW = new Date("2026-10-14T14:00:00Z");
const fresh = async () => { const a = await newAgent({ now: NOW, tz: "America/Chicago", seed: false }); a.profile = await store.get("profiles", a.id, a.id); return a; };

test("a paid referral rewards the referrer and the new customer exactly once", async () => {
  const ref = await fresh(), friend = await fresh();
  const code = await ensureReferralCode(ref.profile);
  assert.ok(await findReferrer(code));
  assert.equal(await recordReferral(await store.get("profiles", friend.id, friend.id), code), true);
  const before = await getBalance(ref.id), fb = await getBalance(friend.id);
  const s = { id: "cs_test_ref_1", customer: "cus_r1", subscription: "sub_r1", amount_total: 4900, metadata: { kind: "plan", plan_key: "pro" } };
  await applyCheckoutSession(friend.id, s); await applyCheckoutSession(friend.id, s);
  assert.equal(await getBalance(ref.id), before + REFERRER_CREDITS);
  assert.equal(await getBalance(friend.id), 1400 + REFEREE_CREDITS);
  assert.equal((await rewardReferral(friend.id, 4900)).rewarded, false, "a second pay-out never happens");
  void fb;
});

test("a free checkout (100% off) never pays a reward", async () => {
  const ref = await fresh(), friend = await fresh();
  const code = await ensureReferralCode(ref.profile);
  await recordReferral(await store.get("profiles", friend.id, friend.id), code);
  const before = await getBalance(ref.id);
  await applyCheckoutSession(friend.id, { id: "cs_test_ref_free", amount_total: 0, metadata: { kind: "plan", plan_key: "pro" } });
  assert.equal(await getBalance(ref.id), before);
});

test("you can't refer yourself, and unknown codes are ignored", async () => {
  const a = await fresh();
  const code = await ensureReferralCode(a.profile);
  assert.equal(await recordReferral(await store.get("profiles", a.id, a.id), code), false);
  const b = await fresh();
  assert.equal(await recordReferral(await store.get("profiles", b.id, b.id), "ZZZZZZZZ"), false);
});

test("rewards stop after the cap", async () => {
  assert.equal(MAX_REWARDED_REFERRALS, 20);
});
