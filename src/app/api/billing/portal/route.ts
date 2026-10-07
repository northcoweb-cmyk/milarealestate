import { api, bad } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

/** Opens the Stripe customer portal so a subscriber can cancel, change card or see invoices. No contracts: cancel any time. */
export const POST = api(async ({ profile }) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return Response.json({ error: "Billing isn't configured on this server yet.", code: "not_configured" }, { status: 409 });
  const sub = (await getStore().list("subscriptions", profile.id))[0];
  if (!sub?.stripe_customer_id) throw bad("There's no paid subscription to manage yet.");
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const f = new URLSearchParams({ customer: sub.stripe_customer_id, return_url: `${base}/settings/credits` });
  const r = await fetch("https://api.stripe.com/v1/billing_portal/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" }, body: f });
  const d = (await r.json()) as { url?: string; error?: { message: string } };
  if (!r.ok || !d.url) throw bad(d.error?.message ?? "Couldn't open billing.");
  return { url: d.url };
});
