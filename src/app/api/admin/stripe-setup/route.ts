import { api, bad } from "@/lib/server/route";
import { isAdmin } from "@/lib/auth";

/**
 * One-time setup for running Mila inside the NorthCo Designs Stripe account without touching its other customers.
 * Creates a Mila-only customer-portal configuration (its own headline, cancel at period end, invoices, card updates) and returns its id.
 * Put that id in Vercel as STRIPE_PORTAL_CONFIG: Mila subscribers then get this portal, and the account's default portal is left alone.
 * Visit /api/admin/stripe-setup?create=1 while signed in as the owner. Without ?create=1 it only reports what is set.
 */
export const GET = api(async ({ profile, req }) => {
  if (!isAdmin(profile)) return Response.json({ error: "Not allowed.", signed_in_as: profile.email, admin_emails_set: Boolean((process.env.ADMIN_EMAILS ?? "").trim()), hint: "ADMIN_EMAILS in this deployment must include the signed-in email. Changing it in Vercel only applies after a new deploy." }, { status: 403 });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw bad("STRIPE_SECRET_KEY isn't set.");
  const existing = process.env.STRIPE_PORTAL_CONFIG;
  if (new URL(req.url).searchParams.get("create") !== "1") return { stripe_key_set: true, portal_config_set: Boolean(existing), portal_config: existing ?? null, hint: existing ? "Mila's portal is configured." : "Add ?create=1 to create Mila's portal configuration." };
  if (existing) return { portal_config: existing, note: "Already set in Vercel; nothing created." };
  const f = new URLSearchParams();
  f.set("business_profile[headline]", "Mila: manage your subscription");
  f.set("business_profile[privacy_policy_url]", "https://milarealestate.app/privacy");
  f.set("business_profile[terms_of_service_url]", "https://milarealestate.app/terms");
  f.set("features[invoice_history][enabled]", "true");
  f.set("features[payment_method_update][enabled]", "true");
  f.set("features[customer_update][enabled]", "true");
  f.set("features[customer_update][allowed_updates][0]", "email");
  f.set("features[customer_update][allowed_updates][1]", "address");
  f.set("features[subscription_cancel][enabled]", "true");
  f.set("features[subscription_cancel][mode]", "at_period_end");
  f.set("features[subscription_cancel][cancellation_reason][enabled]", "true");
  for (const [i, o] of ["too_expensive", "missing_features", "switched_service", "unused", "other"].entries()) f.set(`features[subscription_cancel][cancellation_reason][options][${i}]`, o);
  const r = await fetch("https://api.stripe.com/v1/billing_portal/configurations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" }, body: f });
  const d = (await r.json()) as { id?: string; error?: { message: string } };
  if (!r.ok || !d.id) throw bad(d.error?.message ?? "Stripe didn't create it.");
  return { portal_config: d.id, next: "Add this in Vercel as STRIPE_PORTAL_CONFIG, then redeploy." };
});
