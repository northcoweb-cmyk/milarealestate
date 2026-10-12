import { isLegacyPlan } from "@/lib/plans";
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
  f.set("success_url", `${base}/settings/credits?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  f.set("cancel_url", `${base}/settings/credits?checkout=cancelled`);
  f.set("customer_email", profile.email);
  f.set("client_reference_id", profile.id);
  f.set("allow_promotion_codes", "true"); // launch codes (e.g. half off the first month) are created in Stripe, nothing to ship
  f.set("metadata[user_id]", profile.id);
  f.set("custom_text[submit][message]", "You're buying Mila, your AI operations manager for real estate. Billed by NorthCo Designs. Cancel any time in Settings → Credits.");
  let name: string, cents: number, cfgInterval = "month";
  if (b.kind === "plan") {
    const plan = cfg.plans.find((p) => p.key === b.plan_key);
    if (!plan) throw bad("Unknown plan.");
    if (isLegacyPlan(plan.key) && (await ctx_subKey(profile.id)) !== plan.key) throw bad("That plan is no longer offered. Choose the current Mila plan.");
    if (plan.key === "team") throw bad("The Team plan is set up with you directly. Email admin@milarealestate.app.");
    name = plan.name; cents = Math.round(plan.price_usd * 100);
    f.set("mode", "subscription");
    cfgInterval = plan.interval === "year" ? "year" : "month";
    f.set("metadata[kind]", "plan"); f.set("metadata[plan_key]", plan.key);
    f.set("subscription_data[description]", `Mila: ${plan.name}`); f.set("subscription_data[metadata][user_id]", profile.id); f.set("subscription_data[metadata][plan_key]", plan.key);
  } else {
    const n = Math.round(Number(b.credits));
    if (!Number.isFinite(n) || n < 100 || n > 5000) throw bad("Choose between 100 and 5,000 credits.");
    const preset = cfg.packs.find((p) => p.credits === n);
    name = `${n.toLocaleString()} Mila credits`; cents = Math.round((preset ? preset.price_usd : n * (cfg.credit_price_usd ?? 0.05)) * 100);
    f.set("mode", "payment");
    f.set("metadata[kind]", "pack"); f.set("metadata[credits]", String(n));
  }
  f.set("line_items[0][quantity]", "1");
  // Plans can point at real Stripe Products (own name and statement descriptor "MILA"): set STRIPE_PRICE_<PLAN KEY> to the price id. Without it, an inline price is used.
  const priceId = b.kind === "plan" ? process.env[`STRIPE_PRICE_${String(b.plan_key).toUpperCase()}`] : undefined;
  if (priceId && /^price_[A-Za-z0-9]+$/.test(priceId)) f.set("line_items[0][price]", priceId);
  else {
    f.set("line_items[0][price_data][currency]", "usd");
    f.set("line_items[0][price_data][unit_amount]", String(cents));
    f.set("line_items[0][price_data][product_data][name]", name);
    if (b.kind === "plan") f.set("line_items[0][price_data][recurring][interval]", cfgInterval);
  }
  if (b.kind === "pack" && /^[A-Za-z0-9 ]{2,12}$/.test(process.env.STRIPE_DESCRIPTOR_SUFFIX ?? "")) f.set("payment_intent_data[statement_descriptor_suffix]", process.env.STRIPE_DESCRIPTOR_SUFFIX!);
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" }, body: f });
  const d = (await r.json()) as { url?: string; error?: { message: string } };
  if (!r.ok || !d.url) throw bad(d.error?.message ?? "Couldn't start checkout.");
  return { url: d.url };
});

async function ctx_subKey(userId: string) { return (await getStore().list("subscriptions", userId))[0]?.plan_key ?? null; }
