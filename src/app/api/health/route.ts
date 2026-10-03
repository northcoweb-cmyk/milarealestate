import { NextResponse } from "next/server";
import { aiAvailable, aiProviderName } from "@/lib/ai/provider";
import { authMode } from "@/lib/auth";
import { googleConfigured } from "@/lib/integrations/google";
import { getStore, schemaGaps, ephemeralStoreBlocked, supabaseConfigured } from "@/lib/db/store";

// Non-secret capability report (booleans only) — handy for verifying a deployment.
export async function GET() {
  if (ephemeralStoreBlocked()) return NextResponse.json({ ok: false, store: "none", error: "database not configured — saving is disabled so data is never lost" }, { status: 503 });
  return NextResponse.json({ ok: schemaGaps.size === 0, persistent: supabaseConfigured(), schema_gaps: [...schemaGaps], store: getStore().kind, auth: authMode(), ai: aiAvailable(), ai_provider: aiProviderName(), google: googleConfigured(), stripe: Boolean(process.env.STRIPE_SECRET_KEY), email: Boolean(process.env.RESEND_API_KEY), maps: Boolean(process.env.GOOGLE_MAPS_API_KEY), property_data: Boolean(process.env.RENTCAST_API_KEY || process.env.RENTCAST_API_KEY1 || process.env.RENTCAST_API_KEY2) });
}
