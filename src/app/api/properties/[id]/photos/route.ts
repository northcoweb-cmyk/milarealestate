import { api, notFound } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { getStore } from "@/lib/db/store";
import { getListingMedia } from "@/lib/media/service";

export const maxDuration = 60;

/** The full listing-photo gallery for one saved home. Called only when the property page is opened; served from cache whenever possible. */
export const GET = api<{ id: string }>(async ({ profile, params }) => {
  rateLimit(`media-detail:${profile.id}`, 30);
  const p = await getStore().get("properties", profile.id, params.id);
  if (!p) throw notFound("That property");
  const m = await getListingMedia(profile.id, { address: p.address, city: p.city, state: p.state, zip: p.zip, propertyId: p.id }, { fetch: true });
  return { media: m };
});
