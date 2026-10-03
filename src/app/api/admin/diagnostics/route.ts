import { api } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { isAdmin } from "@/lib/auth";
import { googleHint as hint } from "@/lib/server/google-hints";

interface Check { name: string; ok: boolean; status: string; message: string; fix: string | null }

/** Owner-only: asks Google, with the live key, whether each service Mila uses actually works — and says what to change if not. */
export const GET = api(async ({ profile }) => {
  if (!isAdmin(profile)) return Response.json({ error: "Not allowed." }, { status: 403 });
  rateLimit(`diag:${profile.id}`, 6, 60_000);
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { configured: false, checks: [] as Check[] };
  const addr = encodeURIComponent("1600 Amphitheatre Parkway, Mountain View, CA");
  const t = { signal: AbortSignal.timeout(10_000) };
  const out: Check[] = [];
  const add = (name: string, ok: boolean, status: string, message: string) => out.push({ name, ok, status, message: ok ? "Working." : message, fix: ok ? null : hint(name, status, message) });
  const [geo, places, sv, st] = await Promise.all([
    fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${addr}&key=${key}`, t).then((r) => r.json()).catch(() => null) as Promise<{ status?: string; error_message?: string } | null>,
    fetch("https://places.googleapis.com/v1/places:autocomplete", { method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": key }, body: JSON.stringify({ input: "1600 Amphitheatre" }), ...t }).then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => ({}))) as { error?: { status?: string; message?: string } } })).catch(() => null),
    fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${addr}&source=outdoor&key=${key}`, t).then((r) => r.json()).catch(() => null) as Promise<{ status?: string; error_message?: string } | null>,
    fetch(`https://maps.googleapis.com/maps/api/staticmap?center=${addr}&zoom=18&size=120x120&maptype=satellite&key=${key}`, t).then(async (r) => ({ ok: r.ok && (r.headers.get("content-type") ?? "").startsWith("image/"), status: r.status, text: r.ok ? "" : (await r.text().catch(() => "")).slice(0, 200) })).catch(() => null),
  ]);
  add("Geocoding API", geo?.status === "OK", geo?.status ?? "NETWORK", geo?.error_message ?? "Couldn't reach Google.");
  add("Places API (New)", !!places?.ok, places?.j.error?.status ?? (places ? "ERROR" : "NETWORK"), places?.j.error?.message ?? "Couldn't reach Google.");
  add("Street View Static API", sv?.status === "OK" || sv?.status === "ZERO_RESULTS", sv?.status ?? "NETWORK", sv?.error_message ?? "Couldn't reach Google.");
  add("Maps Static API", !!st?.ok, st ? `HTTP ${st.status}` : "NETWORK", st?.text || "Couldn't reach Google.");
  return { configured: true, checks: out };
});
