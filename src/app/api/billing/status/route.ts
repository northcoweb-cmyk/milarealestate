import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

/** When the subscription renews, or when access ends if it was canceled. Read live from Stripe so it is always the real billing date. */
export const GET = api(async ({ profile }) => {
  const key = process.env.STRIPE_SECRET_KEY;
  const sub = (await getStore().list("subscriptions", profile.id))[0];
  if (!key || !sub?.stripe_subscription_id) return { active: false };
  const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) return { active: false };
  const d = (await r.json()) as { status?: string; cancel_at_period_end?: boolean; cancel_at?: number | null; current_period_end?: number; items?: { data?: { current_period_end?: number; price?: { recurring?: { interval?: string } } }[] } };
  const end = d.current_period_end ?? d.items?.data?.[0]?.current_period_end ?? null; // newer Stripe versions keep the date on the item
  const canceling = Boolean(d.cancel_at_period_end || d.cancel_at);
  const at = d.cancel_at ?? end;
  return { active: ["active", "trialing", "past_due"].includes(d.status ?? ""), status: d.status ?? null, canceling, date: at ? new Date(at * 1000).toISOString() : null, interval: d.items?.data?.[0]?.price?.recurring?.interval ?? null };
});
