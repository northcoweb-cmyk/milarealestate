import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { applyCheckoutSession } from "@/lib/billing/apply-checkout";

/** The page Stripe sends people back to calls this, so credits and the plan show up the moment they pay instead of waiting for the webhook. Safe to call twice. */
export const POST = api(async ({ profile, req }) => {
  rateLimit(`confirm:${profile.id}`, 20, 10 * 60_000);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw bad("Billing isn't configured.");
  const b = await readJson<{ session_id?: unknown }>(req);
  const id = typeof b.session_id === "string" && /^cs_[A-Za-z0-9_]{10,200}$/.test(b.session_id) ? b.session_id : null;
  if (!id) throw bad("Missing checkout session.");
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw bad("Couldn't confirm that payment yet. Your credits will appear in a moment.");
  const s = (await r.json()) as { id: string; status?: string; payment_status?: string; client_reference_id?: string; customer?: string | null; subscription?: string | null; metadata?: Record<string, string> };
  if (s.client_reference_id !== profile.id) throw bad("That checkout belongs to a different account.");
  if (s.status !== "complete" || !["paid", "no_payment_required"].includes(s.payment_status ?? "")) return { applied: false, pending: true };
  const out = await applyCheckoutSession(profile.id, s);
  return { applied: out.applied, credits: out.credits };
});
