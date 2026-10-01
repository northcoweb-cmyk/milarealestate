import { api } from "@/lib/server/route";
import { creditSummary } from "@/lib/credits";

export const GET = api(async ({ profile }) => {
  const s = await creditSummary(profile.id);
  return { ...s, billingConfigured: Boolean(process.env.STRIPE_SECRET_KEY), history: s.history.map((h) => ({ id: h.id, at: h.created_at, label: h.operation, credits: h.credits })) };
});
