import { api, bad } from "@/lib/server/route";
import { isValidTz } from "@/lib/time";

// Resolves a picked suggestion into a verified place: address, city/state, coordinates, time zone.
export const GET = api(async ({ url }) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw bad("Place search isn't set up on this server.");
  const id = url.searchParams.get("id") ?? "";
  if (!/^[\w-]{10,200}$/.test(id)) throw bad("That place isn't valid.");
  const r = await fetch(`https://places.googleapis.com/v1/places/${id}?sessionToken=${encodeURIComponent((url.searchParams.get("t") ?? "").slice(0, 36))}`, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw bad("Couldn't look that place up.");
  const j = (await r.json()) as { displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; addressComponents?: { longText: string; shortText: string; types: string[] }[] };
  const comp = (t: string) => j.addressComponents?.find((c) => c.types.includes(t));
  const city = comp("locality")?.longText ?? comp("sublocality")?.longText ?? comp("postal_town")?.longText ?? comp("administrative_area_level_3")?.longText ?? null;
  const state = comp("administrative_area_level_1")?.shortText ?? null;
  const lat = j.location?.latitude ?? null, lng = j.location?.longitude ?? null;
  let timezone: string | null = null;
  if (lat != null && lng != null) {
    try {
      const t = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${Math.floor(Date.now() / 1000)}&key=${key}`, { signal: AbortSignal.timeout(5000) });
      const tj = (await t.json()) as { status?: string; timeZoneId?: string };
      if (tj.status === "OK" && tj.timeZoneId && isValidTz(tj.timeZoneId)) timezone = tj.timeZoneId;
    } catch { /* time zone stays as it was */ }
  }
  return { place: { id, name: j.displayName?.text ?? null, address: j.formattedAddress ?? null, city, state, cityState: city && state ? `${city}, ${state}` : null, lat, lng, timezone } };
});
