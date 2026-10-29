import { supabaseUrl } from "@/lib/supabase-url";
import { clientIp, hit } from "@/lib/server/rate-limit";

/**
 * One-tap unsubscribe from the win-back emails Mila OS sends to people whose trial ended. The link carries a random per-person token that Mila OS
 * stored on the profile (settings.lapsed.token); finding the profile by it is the only check. Works for GET (the link) and POST (mail apps' one-click).
 */
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const hdr = () => ({ apikey: key(), Authorization: `Bearer ${key()}`, "content-type": "application/json" });
const page = (title: string, text: string, status = 200) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#f3f0fb;font-family:Arial,Helvetica,sans-serif;color:#1b1830;display:grid;place-items:center;min-height:100vh"><main style="max-width:420px;margin:24px;background:#fff;border-radius:20px;padding:32px;text-align:center"><h1 style="font-family:Georgia,serif;font-weight:400;margin:0 0 12px">${title}</h1><p style="line-height:1.6;margin:0">${text}</p></main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

async function unsubscribe(req: Request) {
  if (!hit(`unsub:${clientIp(req)}`, 30, 10 * 60_000)) return page("Slow down", "Too many tries. Please wait a few minutes.", 429);
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[a-f0-9]{40}$/.test(t) || !supabaseUrl() || !key()) return page("Link not valid", "This unsubscribe link isn't valid. Write to support@milarealestate.app and we'll take you off the list.", 404);
  try {
    const f = await fetch(`${supabaseUrl()}/rest/v1/profiles?settings->lapsed->>token=eq.${t}&select=id,settings&limit=1`, { headers: hdr(), cache: "no-store", signal: AbortSignal.timeout(8000) });
    const p = f.ok ? ((await f.json()) as { id: string; settings: Record<string, any> | null }[])[0] : null;
    if (!p) return page("Link not valid", "This unsubscribe link isn't valid. Write to support@milarealestate.app and we'll take you off the list.", 404);
    const settings = p.settings ?? {};
    if (!settings.lapsed?.optout) {
      const r = await fetch(`${supabaseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(p.id)}`, { method: "PATCH", headers: hdr(), body: JSON.stringify({ settings: { ...settings, lapsed: { ...settings.lapsed, optout: true, optout_at: new Date().toISOString() } } }), signal: AbortSignal.timeout(8000) });
      if (!r.ok) return page("Something went wrong", "We couldn't update that just now. Please try again in a minute.", 500);
    }
    return page("You're unsubscribed", "You won't get these emails from Mila again. Your account and data are untouched.");
  } catch { return page("Something went wrong", "Please try again in a minute.", 500); }
}
export const GET = unsubscribe;
export const POST = unsubscribe;
