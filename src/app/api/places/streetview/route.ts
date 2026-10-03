import { api } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";

/** Street View for any address (used by listing cards). Signed-in users only, rate-limited, never stored (Google's terms); the key stays server-side. */
export const GET = api(async ({ profile, url }) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const q = (url.searchParams.get("q") ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 160);
  if (!key || q.length < 8 || !/\d/.test(q)) return new Response(null, { status: 404 });
  rateLimit(`sv:${profile.id}`, 120, 60_000);
  const loc = encodeURIComponent(q);
  const meta = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${loc}&source=outdoor&key=${key}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
  if (meta?.status !== "OK") return new Response(null, { status: 404, headers: { "cache-control": "private, max-age=600" } });
  const img = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=640x440&location=${loc}&fov=80&source=outdoor&key=${key}`, { signal: AbortSignal.timeout(10000) });
  if (!img.ok) return new Response(null, { status: 404 });
  return new Response(await img.arrayBuffer(), { headers: { "content-type": img.headers.get("content-type") ?? "image/jpeg", "cache-control": "private, max-age=86400" } });
});
