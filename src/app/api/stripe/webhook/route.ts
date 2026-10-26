import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { grantCredits, planRefillAmount } from "@/lib/credits";
import { applyCheckoutSession } from "@/lib/billing/apply-checkout";
import { recordPartnerPayment } from "@/lib/partner";

function verify(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const exp = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  return exp.length === parts.v1.length && timingSafeEqual(Buffer.from(exp), Buffer.from(parts.v1));
}

// Stripe → Mila: grants purchased credits and keeps the subscription row current.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 501 });
  const raw = await req.text();
  if (!verify(raw, req.headers.get("stripe-signature") ?? "", secret)) return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  const event = JSON.parse(raw) as { id: string; type: string; data: { object: any } };
  const store = getStore();
  const o = event.data.object;
  const uid: string | undefined = o.metadata?.user_id ?? o.subscription_details?.metadata?.user_id;
  if (!uid) return NextResponse.json({ ok: true });

  // idempotency: skip events we've already applied
  const seen = (await store.list("credit_transactions", uid)).some((t) => t.reason.includes(event.id));
  if (seen) return NextResponse.json({ ok: true, duplicate: true });

  const cfg = await store.getConfig();
  if (event.type === "checkout.session.completed") {
    await applyCheckoutSession(uid, o); // shared with the return page: whichever comes first applies it, the other is a no-op
  }
  if (event.type === "invoice.paid" && o.billing_reason === "subscription_cycle") {
    const sub = (await store.list("subscriptions", uid))[0];
    await recordPartnerPayment(uid, o.total_excluding_tax ?? o.amount_paid, sub?.plan_key, event.id); // each renewal counts toward the partner's commission
    if (sub) {
      const refill = await planRefillAmount(uid, sub); // computed from the period that is ending
      const start = new Date();
      await store.update("subscriptions", uid, sub.id, { period_start: start.toISOString(), period_end: new Date(start.getTime() + 30 * 86_400_000).toISOString(), status: "active" });
      // monthly reset: the plan credits that were spent come back; unused plan credits don't stack; extras (top-ups, bonuses, referrals) are untouched
      if (refill > 0) await grantCredits(uid, refill, "reset", `Monthly reset (${event.id})`);
    }
  }
  if (event.type === "invoice.payment_failed") {
    const sub = (await store.list("subscriptions", uid))[0];
    if (sub) await store.update("subscriptions", uid, sub.id, { status: "past_due" });
  }
  if (event.type === "customer.subscription.deleted") {
    const sub = (await store.list("subscriptions", uid))[0];
    if (sub) await store.update("subscriptions", uid, sub.id, { status: "canceled" });
  }
  return NextResponse.json({ ok: true });
}
