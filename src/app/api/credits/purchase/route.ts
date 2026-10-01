import { api, bad, readJson } from "@/lib/server/route";
import { grantCredits } from "@/lib/credits";

// Development-only top-up, used when Stripe isn't configured. Disabled in production.
export const POST = api(async ({ profile, req }) => {
  if (process.env.STRIPE_SECRET_KEY || process.env.NODE_ENV === "production") throw bad("Use checkout to add credits.");
  const b = await readJson<{ credits?: number }>(req);
  const n = Math.min(Math.max(Math.round(b.credits ?? 0), 0), 10_000);
  if (!n) throw bad("Choose an amount.");
  await grantCredits(profile.id, n, "adjust", "Development top-up (billing not configured)");
  return { ok: true };
});
