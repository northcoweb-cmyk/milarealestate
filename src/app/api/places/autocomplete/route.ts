import { rateLimit } from "@/lib/server/rate-limit";
import { api } from "@/lib/server/route";

export interface PlaceSuggestion { id: string; main: string; secondary: string; text: string }

// Server-side proxy so the Google key never reaches the browser.
// mode: "city" (towns/zip codes), "address" (street addresses), "place" (anything: addresses, businesses).
export const GET = api(async ({ url, profile }) => {
  rateLimit(`places:${profile.id}`, 120);
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { available: false, suggestions: [] as PlaceSuggestion[] };
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return { available: true, suggestions: [] as PlaceSuggestion[] };
  const mode = url.searchParams.get("mode") ?? "place";
  const body: Record<string, unknown> = { input: q, includedRegionCodes: ["us"], sessionToken: (url.searchParams.get("t") ?? "").slice(0, 36) || undefined };
  if (mode === "city") body.includedPrimaryTypes = ["locality", "postal_code"];
  if (mode === "address") body.includedPrimaryTypes = ["street_address", "premise", "subpremise", "route"];
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", { method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { available: false, suggestions: [] as PlaceSuggestion[] }; // key not enabled for Places, etc. — degrade to free text
    const j = (await r.json()) as { suggestions?: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[] };
    const suggestions: PlaceSuggestion[] = (j.suggestions ?? []).flatMap((s) => s.placePrediction ? [{ id: s.placePrediction.placeId, text: s.placePrediction.text?.text ?? "", main: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? "", secondary: s.placePrediction.structuredFormat?.secondaryText?.text ?? "" }] : []).slice(0, 5);
    return { available: true, suggestions };
  } catch { return { available: true, suggestions: [] as PlaceSuggestion[] }; }
});
