import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { buildCard, sortCards } from "@/lib/property-stage";

/** `?view=cards` returns every home with its stage, next event, photo and key numbers for the My Properties tab. */
export const GET = api(async ({ profile, url }) => {
  const s = getStore();
  const properties = await s.list("properties", profile.id);
  if (url.searchParams.get("view") !== "cards") return { properties };
  const [mems, events, images] = await Promise.all([s.list("memories", profile.id), s.list("calendar_events", profile.id), s.list("property_images", profile.id)]);
  const byProp = new Map<string, typeof images>();
  for (const i of images) (byProp.get(i.property_id) ?? byProp.set(i.property_id, []).get(i.property_id)!).push(i);
  const now = new Date();
  return { properties: sortCards(properties.map((p) => buildCard(p, mems, events, (byProp.get(p.id) ?? []).sort((a, b) => a.position - b.position), now))) };
});
