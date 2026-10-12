import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { grantCredits, getBalance } from "@/lib/credits";
import { applyCheckoutSession } from "@/lib/billing/apply-checkout";

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
    if (sub) {
      const start = new Date();
      await store.update("subscriptions", uid, sub.id, { period_start: start.toISOString(), period_end: new Date(start.getTime() + 30 * 86_400_000).toISOString(), status: "active" });
      const bal = await getBalance(uid);
      // monthly reset: allowance replaces the old balance (purchased packs are kept via max())
      await grantCredits(uid, Math.max(sub.credits_per_period - bal, 0), "reset", `Monthly reset (${event.id})`);
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
