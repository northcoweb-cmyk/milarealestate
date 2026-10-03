import { api, notFound } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { logError } from "@/lib/server/errors";
import { placeImage } from "@/lib/server/place-image";

// A photo of the exact address (Street View, else satellite), fetched on demand and never stored (Google's terms). The API key stays server-side.
export const GET = api<{ id: string }>(async ({ profile, params, url }) => {
  const p = await getStore().get("properties", profile.id, params.id);
  if (!p) throw notFound("That property");
  // Only with a known city + state: otherwise "123 Main Street" could resolve to the wrong house.
  if (!process.env.GOOGLE_MAPS_API_KEY || !p.city || !p.state) return new Response(null, { status: 404 });
  const q = `${p.address}, ${p.city}, ${p.state}${p.zip ? " " + p.zip : ""}`;
  const r = await placeImage(q, url.searchParams.get("size") ?? "640x440");
  if (!r.ok) {
    if (!["ZERO_RESULTS", "NOT_FOUND", "NETWORK"].includes(r.status)) await logError({ source: "api", level: "warn", message: `Google ${r.api}: ${r.status} — ${r.message}`.slice(0, 300), route: "GET /api/properties/:id/streetview" });
    return new Response(null, { status: 404 });
  }
  return new Response(r.body, { headers: { "content-type": r.type, "cache-control": "private, max-age=3600", "x-image-source": r.source } });
});
