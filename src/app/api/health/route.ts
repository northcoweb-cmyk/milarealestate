import { NextResponse } from "next/server";
import { aiAvailable, aiProviderName } from "@/lib/ai/provider";
import { authMode } from "@/lib/auth";
import { googleConfigured } from "@/lib/integrations/google";
import { getStore } from "@/lib/db/store";

// Non-secret capability report (booleans only) — handy for verifying a deployment.
export async function GET() {
  return NextResponse.json({ ok: true, store: getStore().kind, auth: authMode(), ai: aiAvailable(), ai_provider: aiProviderName(), google: googleConfigured(), stripe: Boolean(process.env.STRIPE_SECRET_KEY), email: Boolean(process.env.RESEND_API_KEY) });
}
