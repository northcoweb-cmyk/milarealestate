import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { getListingMedia, peekMedia } from "@/lib/media/service";
import type { MediaQuery } from "@/lib/media/types";

export const maxDuration = 60;
const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");

/**
 * Thumbnails for a rail of cards. `enrich:false` is cache-only (free, instant). `enrich:true` may spend provider calls for homes
 * that aren't cached yet (subject to the plan allowance). Only the SMALL image goes back; the full gallery is /api/properties/:id/photos.
 */
export const POST = api(async ({ profile, req }) => {
  rateLimit(`media:${profile.id}`, 40);
  const b = await readJson<{ items?: unknown; enrich?: boolean }>(req);
  if (!Array.isArray(b.items) || !b.items.length) throw bad("Nothing to look up.");
  const items = b.items.slice(0, 8).map((x: any) => ({ key: s(x?.key, 80), q: { address: s(x?.address, 120), city: s(x?.city, 60) || null, state: s(x?.state, 2).toUpperCase() || null, zip: s(x?.zip, 10) || null, listingId: s(x?.listingId, 80) || null, propertyId: s(x?.propertyId, 80) || null } as MediaQuery }))
    .filter((i) => i.key && /\d/.test(i.q.address));
  const out: { key: string; photoStatus: string; thumb: string | null; photoCount: number }[] = [];
  for (const it of items) { // sequential: keeps provider concurrency at 1 per request
    const m = b.enrich ? await getListingMedia(profile.id, it.q, { fetch: true }) : (await peekMedia(it.q)) ?? { photoStatus: "pending", photos: [], photoCount: 0 };
    const first = m.photos[0];
    out.push({ key: it.key, photoStatus: m.photoStatus, thumb: first ? first.thumbUrl ?? first.url : null, photoCount: m.photoCount });
  }
  return { items: out };
});
