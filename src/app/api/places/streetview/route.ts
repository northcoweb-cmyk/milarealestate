import { api } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/errors";
import { placeImage } from "@/lib/server/place-image";

/** A photo of any address (used by listing cards): Street View, else satellite. Signed-in users only, rate-limited; the key stays server-side. */
export const GET = api(async ({ profile, url }) => {
  const q = (url.searchParams.get("q") ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 160);
  if (!process.env.GOOGLE_MAPS_API_KEY || q.length < 8 || !/\d/.test(q)) return new Response(null, { status: 404 });
  rateLimit(`sv:${profile.id}`, 120, 60_000);
  const r = await placeImage(q, url.searchParams.get("size") ?? "640x440");
  if (!r.ok) {
    // "no coverage" is normal; anything else means the key or its settings need attention
    if (!["ZERO_RESULTS", "NOT_FOUND", "NETWORK"].includes(r.status)) await logError({ source: "api", level: "warn", message: `Google ${r.api}: ${r.status} — ${r.message}`.slice(0, 300), route: "GET /api/places/streetview" });
    return new Response(null, { status: 404, headers: { "cache-control": "private, max-age=300" } });
  }
  return new Response(r.body, { headers: { "content-type": r.type, "cache-control": "private, max-age=86400", "x-image-source": r.source } });
});
