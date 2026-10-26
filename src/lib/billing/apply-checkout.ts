import { getStore } from "../db/store";
import { creditBuckets, grantCredits } from "../credits";
import { rewardReferral } from "../referral";
import { recordPartnerPayment } from "../partner";

/**
 * Applies one completed Stripe Checkout session: credit packs add their credits, a plan starts the subscription and its monthly credits (plus the annual perk).
 * Called by the webhook AND by the return page, whichever arrives first, so credits show up instantly. The session id is the idempotency key, so it can never apply twice.
 */
export async function applyCheckoutSession(uid: string, o: { id: string; customer?: string | null; subscription?: string | null; amount_total?: number | null; amount_subtotal?: number | null; total_details?: { amount_tax?: number | null } | null; metadata?: Record<string, string> | null }): Promise<{ applied: boolean; credits: number }> {
  const store = getStore();
  const tag = `cs:${o.id}`;
  if ((await store.list("credit_transactions", uid)).some((t) => t.reason.includes(tag))) return { applied: false, credits: 0 };
  const md = o.metadata ?? {};
  const cfg = await store.getConfig();
  let credits = 0;
  if (md.kind === "pack") {
    credits = Number(md.credits);
    if (Number.isFinite(credits) && credits > 0) await grantCredits(uid, credits, "purchase", `Credit pack (${tag})`);
  } else if (md.kind === "plan") {
    const plan = cfg.plans.find((p) => p.key === md.plan_key);
    const sub = (await store.list("subscriptions", uid))[0];
    if (plan && sub) {
      const prev = await creditBuckets(uid, sub); // extras (top-ups, bonuses, referral credits) are kept; the old plan's unused credits are replaced
      const start = new Date();
      await store.update("subscriptions", uid, sub.id, { plan_key: plan.key, status: "active", credits_per_period: plan.credits, period_start: start.toISOString(), period_end: new Date(start.getTime() + 30 * 86_400_000).toISOString(), stripe_customer_id: o.customer ?? null, stripe_subscription_id: o.subscription ?? null });
      await grantCredits(uid, plan.credits - prev.plan, "reset", `Plan started: ${plan.name} (${tag})`); // the plan allowance replaces the old plan credits; extras stay
      credits = plan.credits;
      await recordPartnerPayment(uid, (o.amount_total ?? 0) - (o.total_details?.amount_tax ?? 0), plan.key, tag); // a creator partner's commission is worked out from what was really paid
      await rewardReferral(uid, o.amount_total, plan.key).catch(() => null); // a friend who invited them is thanked once, only for a real (non-free) payment
      if (plan.bonus_credits) { await grantCredits(uid, plan.bonus_credits, "grant", `Annual perk: ${plan.bonus_credits} bonus credits (${tag}:bonus)`); credits += plan.bonus_credits; }
    }
  }
  return { applied: true, credits };
}
