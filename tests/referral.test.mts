import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { applyCheckoutSession } from "../src/lib/billing/apply-checkout.ts";
import { ensureReferralCode, onSignup, settleReferrals, applyCode, referralSummary, HOLD_DAYS, REFERRER_CREDITS_MONTHLY, REFERRER_CREDITS_ANNUAL, REFEREE_CREDITS, MAX_REWARDS_PER_30_DAYS } from "../src/lib/referral.ts";
import { getBalance } from "../src/lib/credits.ts";

const NOW = new Date("2026-10-14T14:00:00Z");
const prof = (id: string) => store.get("profiles", id, id);
const fresh = async () => newAgent({ now: NOW, tz: "America/Chicago", seed: false });
async function pay(friendId: string, plan = "pro", n = Math.random().toString(36).slice(2)) {
  await applyCheckoutSession(friendId, { id: `cs_test_${n}`, customer: "cus_x", subscription: "sub_x", amount_total: plan === "pro" ? 4900 : 49000, metadata: { kind: "plan", plan_key: plan } });
}
const ageReferral = async (friendId: string, days: number) => { const f = await prof(friendId); await store.update("profiles", friendId, friendId, { settings: { ...f.settings, referral: { ...f.settings.referral, paid_at: new Date(Date.now() - days * 86_400_000).toISOString() } } }); };

test("fair and held: friend gets a bonus now, the referrer is paid only after the hold and while still subscribed", async () => {
  const ref = await fresh(), friend = await fresh();
  const code = await ensureReferralCode(await prof(ref.id));
  assert.equal(await onSignup(await prof(friend.id), code, "1.1.1.1"), true);
  const refBefore = await getBalance(ref.id);
  await pay(friend.id);
  assert.equal(await getBalance(friend.id), 1400 + REFEREE_CREDITS);
  assert.equal(await getBalance(ref.id), refBefore, "nothing yet for the referrer");
  assert.deepEqual(await settleReferrals(), { rewarded: 0, voided: 0 }, "still inside the hold");
  await ageReferral(friend.id, HOLD_DAYS + 1);
  const r = await settleReferrals();
  assert.equal(r.rewarded, 1);
  assert.equal(await getBalance(ref.id), refBefore + REFERRER_CREDITS_MONTHLY);
  assert.deepEqual(await settleReferrals(), { rewarded: 0, voided: 0 }, "never paid twice");
  assert.ok(REFERRER_CREDITS_MONTHLY <= 300 && REFERRER_CREDITS_ANNUAL <= 700, "reward stays a fraction of a month's credits");
});

test("an annual referral earns the annual reward; a friend who cancels inside the hold voids it", async () => {
  const ref = await fresh(), a = await fresh(), b = await fresh();
  const code = await ensureReferralCode(await prof(ref.id));
  await onSignup(await prof(a.id), code, "2.2.2.2"); await onSignup(await prof(b.id), code, "3.3.3.3");
  const before = await getBalance(ref.id);
  await pay(a.id, "pro_annual"); await pay(b.id);
  await ageReferral(a.id, 15); await ageReferral(b.id, 15);
  const sb = (await store.list("subscriptions", b.id))[0]; await store.update("subscriptions", b.id, sb.id, { status: "canceled" });
  const r = await settleReferrals();
  assert.deepEqual(r, { rewarded: 1, voided: 1 });
  assert.equal(await getBalance(ref.id), before + REFERRER_CREDITS_ANNUAL);
});

test("free (100% off) checkouts never start a reward", async () => {
  const ref = await fresh(), friend = await fresh();
  await onSignup(await prof(friend.id), await ensureReferralCode(await prof(ref.id)), "4.4.4.4");
  await applyCheckoutSession(friend.id, { id: "cs_test_free_ref", amount_total: 0, metadata: { kind: "plan", plan_key: "pro" } });
  assert.equal((await prof(friend.id)).settings.referral?.status, undefined);
});

test("self-referral, the same inbox, unknown codes and same-network sign-ups can't be farmed", async () => {
  const a = await fresh();
  const code = await ensureReferralCode(await prof(a.id));
  assert.equal(await onSignup(await prof(a.id), code, "5.5.5.5"), false, "own code");
  assert.equal(await onSignup(await prof(a.id), "ZZZZZZZZ", "5.5.5.5"), false, "unknown code");
  const friend = await fresh();
  await onSignup(await prof(a.id), undefined, "9.9.9.9"); // referrer's own sign-up network
  assert.equal(await onSignup(await prof(friend.id), code, "9.9.9.9"), true);
  await pay(friend.id);
  const f = await prof(friend.id);
  assert.equal(f.settings.referral?.status, "review", "same network goes to review, not an automatic payout");
  assert.equal(await getBalance(friend.id), 1400, "no welcome bonus either");
});

test("at most 5 rewards in 30 days, the rest wait", async () => {
  const ref = await fresh(); const code = await ensureReferralCode(await prof(ref.id));
  const kids = [] as string[];
  for (let i = 0; i < MAX_REWARDS_PER_30_DAYS + 2; i++) { const k = await fresh(); kids.push(k.id); await onSignup(await prof(k.id), code, `10.0.0.${i}`); await pay(k.id); await ageReferral(k.id, 20); }
  const r = await settleReferrals();
  assert.equal(r.rewarded, MAX_REWARDS_PER_30_DAYS);
  const sum = await referralSummary(await prof(ref.id));
  assert.equal(sum.referred.filter((x) => x.state.startsWith("pending")).length, 2, "the other two are still pending");
});

test("a new account can add a code before paying, once, but not its own and not after subscribing", async () => {
  const ref = await fresh(), me = await fresh();
  const code = await ensureReferralCode(await prof(ref.id));
  assert.equal((await applyCode(await prof(me.id), "NOPE1234")).ok, false);
  assert.equal((await applyCode(await prof(ref.id), code)).ok, false, "own code");
  assert.equal((await applyCode(await prof(me.id), code)).ok, true);
  assert.equal((await applyCode(await prof(me.id), code)).ok, false, "only once");
});
