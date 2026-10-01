import { api, notFound } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

// Street View of the exact address, fetched on demand and never stored (Google's terms). The API key stays server-side.
export const GET = api<{ id: string }>(async ({ profile, params, url }) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const p = await getStore().get("properties", profile.id, params.id);
  if (!p) throw notFound("That property");
  // Only with a known city + state: otherwise "123 Main Street" could resolve to the wrong house.
  if (!key || !p.city || !p.state) return new Response(null, { status: 404 });
  const loc = encodeURIComponent(`${p.address}, ${p.city}, ${p.state}${p.zip ? " " + p.zip : ""}`);
  const meta = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${loc}&source=outdoor&key=${key}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null) as { status?: string } | null;
  if (meta?.status !== "OK") return new Response(null, { status: 404 });
  const size = /^\d{3}x\d{3}$/.test(url.searchParams.get("size") ?? "") ? url.searchParams.get("size")! : "640x440";
  const img = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${loc}&fov=80&source=outdoor&key=${key}`, { signal: AbortSignal.timeout(10000) });
  if (!img.ok) return new Response(null, { status: 404 });
  return new Response(await img.arrayBuffer(), { headers: { "content-type": img.headers.get("content-type") ?? "image/jpeg", "cache-control": "private, max-age=3600" } });
});
