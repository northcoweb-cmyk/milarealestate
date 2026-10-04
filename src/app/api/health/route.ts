import { NextResponse } from "next/server";
import { aiAvailable, aiProviderName } from "@/lib/ai/provider";
import { authMode } from "@/lib/auth";
import { googleConfigured } from "@/lib/integrations/google";
import { activeProvider, providerName } from "@/lib/media/providers";
import { zillapiBase, zillapiKey } from "@/lib/media/providers/zillapi";
import { photoTrail } from "@/lib/media/service";
import { getStore, schemaGaps, ephemeralStoreBlocked, supabaseConfigured } from "@/lib/db/store";

/** Photo pipeline status for deployment checks: booleans, counts and a one-word failure code - never keys or addresses. */
async function photoStatus() {
  const s = getStore();
  const out: Record<string, unknown> = { provider: providerName(), key_found: Boolean(activeProvider()), cache_table: false, usage_table: false, cached_homes: 0, provider_calls: 0, last_issue: null };
  try { out.cached_homes = (await s.listAll("listing_media_cache")).filter((r) => r.status === "ok").length; out.cache_table = true; } catch { /* migration 0004 not run */ }
  try {
    const rows = await s.listAll("api_usage");
    out.usage_table = true; out.provider_calls = rows.filter((r) => r.provider === "zillapi" || r.provider === "rapidapi").length;
    out.failed_calls = rows.filter((r) => (r.provider === "zillapi" || r.provider === "rapidapi") && !r.success).length;
  } catch { /* migration 0004 not run */ }
  try {
    const last = (await s.listAll("error_logs")).filter((l) => l.route === "listing-photos").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const code = last && /: (auth|credits|rate|network|bad_response|mismatch|not_found) -|lookup failed/.exec(last.message);
    out.last_issue = code ? (code[1] ?? "error") : last ? "error" : null;
    out.last_issue_at = last?.created_at ?? null;
    out.recent = (await s.listAll("error_logs")).filter((l) => l.route === "listing-photos").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6).map((l) => `${l.created_at.slice(11, 19)} ${l.message.replace(/ for .*?: /, ": ").slice(0, 70)}`);
  } catch { /* ignore */ }
  out.trail = photoTrail();
  // zero-credit key check: asking for a photo set of a home that doesn't exist is a free 404 when the key is good, a 401 when it isn't
  if (activeProvider() && providerName() === "zillapi") {
    try { const r = await fetch(`${zillapiBase()}/properties/0/photos`, { headers: { authorization: `Bearer ${zillapiKey()}` }, signal: AbortSignal.timeout(8000) }); out.key_status = r.status === 401 || r.status === 403 ? "rejected" : r.status === 402 ? "out_of_credits" : r.status === 429 ? "rate_limited" : "ok"; out.key_http = r.status; }
    catch { out.key_status = "unreachable"; }
  }
  return out;
}

// Non-secret capability report (booleans only) — handy for verifying a deployment.
export async function GET() {
  if (ephemeralStoreBlocked()) return NextResponse.json({ ok: false, store: "none", error: "database not configured — saving is disabled so data is never lost" }, { status: 503 });
  return NextResponse.json({ ok: schemaGaps.size === 0, persistent: supabaseConfigured(), schema_gaps: [...schemaGaps], store: getStore().kind, auth: authMode(), ai: aiAvailable(), ai_provider: aiProviderName(), google: googleConfigured(), stripe: Boolean(process.env.STRIPE_SECRET_KEY), email: Boolean(process.env.RESEND_API_KEY), maps: Boolean(process.env.GOOGLE_MAPS_API_KEY), property_data: Boolean(process.env.RENTCAST_API_KEY || process.env.RENTCAST_API_KEY1 || process.env.RENTCAST_API_KEY2), photos: await photoStatus() });
}
