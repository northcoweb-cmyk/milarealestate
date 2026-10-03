/**
 * Photos of an address from Google: Street View when Google has coverage, a satellite view when it doesn't.
 * Failures are returned with Google's own reason (key not allowed, API not switched on, billing…) instead of being swallowed,
 * so the owner dashboard can say exactly what to fix.
 */
export type PlaceImage = { ok: true; body: ArrayBuffer; type: string; source: "streetview" | "satellite" } | { ok: false; status: string; message: string; api: "Street View Static API" | "Maps Static API" };

const T = 9000;
export async function placeImage(q: string, size = "640x440"): Promise<PlaceImage> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false, status: "NO_KEY", message: "GOOGLE_MAPS_API_KEY isn't set.", api: "Street View Static API" };
  const loc = encodeURIComponent(q);
  const sz = /^\d{3}x\d{3}$/.test(size) ? size : "640x440";
  const meta = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${loc}&source=outdoor&key=${key}`, { signal: AbortSignal.timeout(T) }).then((r) => r.json() as Promise<{ status?: string; error_message?: string }>).catch(() => null);
  if (!meta) return { ok: false, status: "NETWORK", message: "Couldn't reach Google.", api: "Street View Static API" };
  if (meta.status === "OK") {
    const img = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=${sz}&location=${loc}&fov=80&source=outdoor&key=${key}`, { signal: AbortSignal.timeout(T) }).catch(() => null);
    if (img?.ok && (img.headers.get("content-type") ?? "").startsWith("image/")) return { ok: true, body: await img.arrayBuffer(), type: img.headers.get("content-type")!, source: "streetview" };
    return { ok: false, status: `HTTP_${img?.status ?? "ERR"}`, message: "Google returned no Street View image.", api: "Street View Static API" };
  }
  if (meta.status !== "ZERO_RESULTS" && meta.status !== "NOT_FOUND") return { ok: false, status: meta.status ?? "UNKNOWN", message: meta.error_message ?? "Google refused the request.", api: "Street View Static API" };
  // No street-level photo of this address: a satellite view of the lot is still a real picture of the place
  const sat = await fetch(`https://maps.googleapis.com/maps/api/staticmap?center=${loc}&zoom=19&size=${sz}&maptype=satellite&key=${key}`, { signal: AbortSignal.timeout(T) }).catch(() => null);
  if (sat?.ok && (sat.headers.get("content-type") ?? "").startsWith("image/")) return { ok: true, body: await sat.arrayBuffer(), type: sat.headers.get("content-type")!, source: "satellite" };
  return { ok: false, status: meta.status, message: sat && !sat.ok ? `No Street View here, and the satellite view failed (HTTP ${sat.status}).` : "No Street View or satellite view for this address.", api: "Maps Static API" };
}
