import { api } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { NIL_USER } from "@/lib/server/errors";
import { providerName } from "@/lib/media/providers";
import { zillapiBase, zillapiKey, zillapiKeyVar, ZILLAPI_KEY_VARS } from "@/lib/media/providers/zillapi";

interface Step { name: string; ok: boolean; message: string }
export const maxDuration = 60;

/** Owner-only: walks the photo pipeline one step at a time with the LIVE settings and says exactly which step fails. A full run costs ~4 provider credits. */
export const GET = api(async ({ profile, url }) => {
  if (!isAdmin(profile)) return Response.json({ error: "Not allowed." }, { status: 403 });
  rateLimit(`photocheck:${profile.id}`, 4, 60_000);
  const steps: Step[] = [];
  const add = (name: string, ok: boolean, message: string) => { steps.push({ name, ok, message }); return ok; };
  const prov = providerName();
  if (!add("Provider selected", prov === "zillapi" || prov === "rapidapi", prov === "zillapi" || prov === "rapidapi" ? `PHOTO_PROVIDER = ${prov}` : `PHOTO_PROVIDER is “${prov}”, which isn't a known provider. Use zillapi or rapidapi (or remove it).`)) return { steps };
  if (prov === "rapidapi") { add("API key", Boolean(process.env.RAPIDAPI_KEY), process.env.RAPIDAPI_KEY ? "RAPIDAPI_KEY is set." : "RAPIDAPI_KEY is not set."); return { steps }; }
  const keyVar = zillapiKeyVar();
  if (!add("API key found", Boolean(keyVar), keyVar ? `Found in ${keyVar}.` : `No key found. Add it in Vercel as ${ZILLAPI_KEY_VARS[0]} (also accepted: ${ZILLAPI_KEY_VARS.slice(1).join(", ")}), then redeploy - env changes only apply to NEW deployments.`)) return { steps };
  let tablesOk = true;
  for (const t of ["listing_media_cache", "api_usage"] as const) {
    try { await getStore().findBy(t, NIL_USER, { id: "00000000-0000-0000-0000-000000000001" }); add(`Table ${t}`, true, "Exists."); }
    catch (e) { tablesOk = false; add(`Table ${t}`, false, `Missing or unreadable (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Run supabase/migrations/0004_listing_media.sql in the Supabase SQL editor.`); }
  }
  const mine = (await getStore().list("properties", profile.id)).find((p) => p.city && p.state);
  const address = (url.searchParams.get("address") || (mine ? `${mine.address}, ${mine.city}, ${mine.state}${mine.zip ? " " + mine.zip : ""}` : "350 5th Ave, New York, NY 10118")).slice(0, 160);
  add("Testing address", true, `${address}${mine ? " (one of your own properties)" : ""}`);
  const hdr = { authorization: `Bearer ${zillapiKey()}`, accept: "application/json" };
  let zpid = "";
  try {
    const r = await fetch(`${zillapiBase()}/properties/by-address?${new URLSearchParams({ address })}`, { headers: hdr, signal: AbortSignal.timeout(20_000) });
    const body = (await r.json().catch(() => ({}))) as { data?: { zpid?: unknown; address?: { streetAddress?: string; city?: string } }; error?: unknown; message?: unknown };
    zpid = String(body.data?.zpid ?? "");
    const hint: Record<number, string> = { 401: "Zillapi rejected the key - copy it again from your Zillapi dashboard (it starts with zk_).", 402: "Zillapi says you're out of credits (the free plan is 100 one-time credits).", 403: "Key not allowed.", 404: "Zillapi doesn't know that address.", 429: "Zillapi rate limit - wait a minute." };
    if (!add("Address lookup (3 credits)", r.ok && !!zpid, r.ok && zpid ? `HTTP ${r.status}. Matched ${body.data?.address?.streetAddress ?? address}, ${body.data?.address?.city ?? ""} (ZPID ${zpid}).` : `HTTP ${r.status}. ${hint[r.status] ?? "Unexpected answer."} ${JSON.stringify(body.error ?? body.message ?? "").slice(0, 150)}`)) return { steps };
  } catch (e) { add("Address lookup (3 credits)", false, `Couldn't reach Zillapi from the server: ${e instanceof Error ? e.message : "network error"}.`); return { steps }; }
  try {
    const r = await fetch(`${zillapiBase()}/properties/${encodeURIComponent(zpid)}/photos`, { headers: hdr, signal: AbortSignal.timeout(20_000) });
    const body = (await r.json().catch(() => ({}))) as { data?: unknown[] };
    const n = Array.isArray(body.data) ? body.data.length : 0;
    add("Photos (1 credit)", r.ok && n > 0, r.ok ? (n ? `HTTP ${r.status}. ${n} photos returned.` : "HTTP 200 but the gallery is empty for this home.") : `HTTP ${r.status}.`);
  } catch (e) { add("Photos (1 credit)", false, e instanceof Error ? e.message : "network error"); }
  if (tablesOk) add("Ready", steps.every((s) => s.ok), steps.every((s) => s.ok) ? "Everything works. If cards still have no photos, the home itself isn't matched at Zillapi - check Errors & gaps for “Listing photos”." : "Fix the failing step above.");
  return { steps };
});
