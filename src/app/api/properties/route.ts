import { parseAddress } from "@/lib/agent/nlu";
import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { buildCard, sortCards } from "@/lib/property-stage";

/** `?view=cards` returns every home with its stage, next event, photo and key numbers for the My Properties tab. */
export const GET = api(async ({ profile, url }) => {
  const s = getStore();
  let properties = await s.list("properties", profile.id);
  if (url.searchParams.get("view") !== "cards") return { properties };
  const [mems, events, images] = await Promise.all([s.list("memories", profile.id), s.list("calendar_events", profile.id), s.list("property_images", profile.id)]);
  // A showing or inspection booked before homes were saved automatically: give it a property now so it appears here (once; the event is linked).
  const orphans = events.filter((e) => !e.property_id && e.status !== "cancelled" && ["showing", "inspection"].includes(e.kind));
  for (const e of orphans) {
    const street = parseAddress(`${e.location ?? ""} ${e.title}`);
    if (!street) continue;
    const have = properties.find((p) => p.address.toLowerCase() === street.toLowerCase());
    const prop = have ?? await s.insert("properties", profile.id, { address: street, city: null, state: null, zip: null, county: null, list_price: null, beds: null, baths: null, sqft: null, listing_url: null, description: null, verified: false, is_demo: false } as never);
    if (!have) properties = [...properties, prop];
    await s.update("calendar_events", profile.id, e.id, { property_id: prop.id } as never);
    e.property_id = prop.id;
  }
  const byProp = new Map<string, typeof images>();
  for (const i of images) (byProp.get(i.property_id) ?? byProp.set(i.property_id, []).get(i.property_id)!).push(i);
  const now = new Date();
  return { properties: sortCards(properties.map((p) => buildCard(p, mems, events, (byProp.get(p.id) ?? []).sort((a, b) => a.position - b.position), now))) };
});
