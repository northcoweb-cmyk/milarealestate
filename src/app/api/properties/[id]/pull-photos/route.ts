import { api, bad, notFound, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { pullListingPhotos } from "@/lib/images/listing";
import { explainPull } from "@/lib/agent/handlers/photos";

export const maxDuration = 60;

// "Find photos for me": reads the listing link's public preview metadata (honours robots.txt).
export const POST = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson<{ url?: string }>(req);
  const store = getStore();
  const prop = await store.get("properties", profile.id, params.id);
  if (!prop) throw notFound("That property");
  const url = (b.url ?? prop.listing_url ?? "").trim();
  if (!url) throw bad("Paste a listing link first.");
  const r = await pullListingPhotos(store, profile.id, prop, url);
  return { ...r, message: explainPull(r, prop.address) };
});
