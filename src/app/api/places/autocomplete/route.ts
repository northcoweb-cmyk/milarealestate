import { rateLimit } from "@/lib/server/rate-limit";
import { api } from "@/lib/server/route";
import { logError } from "@/lib/server/errors";
import { fallbackCities } from "@/lib/places-fallback";

export interface PlaceSuggestion { id: string; main: string; secondary: string; text: string }

// Server-side proxy so the Google key never reaches the browser.
// mode: "city" (towns/zip codes), "address" (street addresses), "place" (anything: addresses, businesses).
let lastWarn = 0;
export const GET = api(async ({ url, profile }) => {
  rateLimit(`places:${profile.id}`, 120);
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const modeIn = url.searchParams.get("mode") ?? "place";
  // no Google search: a city typed still gets real suggestions from the built-in list (addresses stay free text)
  const fallback = () => (modeIn === "city" ? { available: true, fallback: true, suggestions: fallbackCities(q) as PlaceSuggestion[] } : { available: false, suggestions: [] as PlaceSuggestion[] });
  if (!key) return fallback();
  if (q.length < 2) return { available: true, suggestions: [] as PlaceSuggestion[] };
  const mode = url.searchParams.get("mode") ?? "place";
  const body: Record<string, unknown> = { input: q, includedRegionCodes: ["us"], sessionToken: (url.searchParams.get("t") ?? "").slice(0, 36) || undefined };
  if (mode === "city") body.includedPrimaryTypes = ["locality", "postal_code"];
  if (mode === "address") body.includedPrimaryTypes = ["street_address", "premise", "subpremise", "route"];
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", { method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) });
    if (!r.ok) {
      // the key's project does not have Places switched on, or the key is restricted: say so once in a while where the owner looks, and keep typing useful
      if (Date.now() - lastWarn > 10 * 60_000) { lastWarn = Date.now(); const body = await r.text().catch(() => ""); await logError({ source: "api", level: "warn", message: `Google place search refused (${r.status}): ${body.slice(0, 220)}. In Google Cloud turn on "Places API (New)", "Geocoding API" and "Time Zone API" for the project of GOOGLE_MAPS_API_KEY.`, route: "GET /api/places/autocomplete" }); }
      return fallback();
    }
    const j = (await r.json()) as { suggestions?: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[] };
    const suggestions: PlaceSuggestion[] = (j.suggestions ?? []).flatMap((s) => s.placePrediction ? [{ id: s.placePrediction.placeId, text: s.placePrediction.text?.text ?? "", main: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? "", secondary: s.placePrediction.structuredFormat?.secondaryText?.text ?? "" }] : []).slice(0, 5);
    return { available: true, suggestions };
  } catch { return fallback(); }
});
