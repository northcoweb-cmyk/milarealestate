import { api, notFound, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const store = getStore();
  const property = await store.get("properties", profile.id, params.id);
  if (!property) throw notFound("That property");
  const images = (await store.list("property_images", profile.id)).filter((i) => i.property_id === property.id).sort((a, b) => a.position - b.position);
  const events = (await store.list("calendar_events", profile.id)).filter((e) => e.property_id === property.id);
  return { property, images, events };
});

// The agent confirms facts: only then are they used in drafts and posts.
export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson(req);
  const patch: Record<string, unknown> = {};
  for (const k of ["city", "state", "zip", "county", "list_price", "beds", "baths", "sqft", "listing_url", "description"]) if (k in b) patch[k] = b[k] === "" ? null : b[k];
  if (typeof b.verified === "boolean") patch.verified = b.verified;
  const p = await getStore().update("properties", profile.id, params.id, patch);
  if (!p) throw notFound("That property");
  return { property: p };
});
