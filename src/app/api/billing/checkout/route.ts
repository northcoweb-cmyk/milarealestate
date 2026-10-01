import { api, bad, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

/** Creates a Stripe Checkout session (plan subscription or credit pack) using inline price data. */
export const POST = api(async ({ profile, req }) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return Response.json({ error: "Billing isn't configured on this server yet.", code: "not_configured" }, { status: 409 });
  const b = await readJson<{ kind: "plan" | "pack"; plan_key?: string; credits?: number }>(req);
  const cfg = await getStore().getConfig();
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const f = new URLSearchParams();
  f.set("success_url", `${base}/settings/credits?checkout=success`);
  f.set("cancel_url", `${base}/settings/credits?checkout=cancelled`);
  f.set("customer_email", profile.email);
  f.set("client_reference_id", profile.id);
  f.set("metadata[user_id]", profile.id);
  let name: string, cents: number;
  if (b.kind === "plan") {
    const plan = cfg.plans.find((p) => p.key === b.plan_key);
    if (!plan) throw bad("Unknown plan.");
    name = plan.name; cents = Math.round(plan.price_usd * 100);
    f.set("mode", "subscription");
    f.set("line_items[0][price_data][recurring][interval]", "month");
    f.set("metadata[kind]", "plan"); f.set("metadata[plan_key]", plan.key);
    f.set("subscription_data[metadata][user_id]", profile.id); f.set("subscription_data[metadata][plan_key]", plan.key);
  } else {
    const pack = cfg.packs.find((p) => p.credits === b.credits);
    if (!pack) throw bad("Unknown credit pack.");
    name = `${pack.credits.toLocaleString()} Mila credits`; cents = Math.round(pack.price_usd * 100);
    f.set("mode", "payment");
    f.set("metadata[kind]", "pack"); f.set("metadata[credits]", String(pack.credits));
  }
  f.set("line_items[0][quantity]", "1");
  f.set("line_items[0][price_data][currency]", "usd");
  f.set("line_items[0][price_data][unit_amount]", String(cents));
  f.set("line_items[0][price_data][product_data][name]", name);
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" }, body: f });
  const d = (await r.json()) as { url?: string; error?: { message: string } };
  if (!r.ok || !d.url) throw bad(d.error?.message ?? "Couldn't start checkout.");
  return { url: d.url };
});
