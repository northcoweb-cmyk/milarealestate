import { api, bad, notFound, readJson } from "@/lib/server/route";
import { cleanText } from "@/lib/server/sanitize";
import { getStore } from "@/lib/db/store";
import { deleteProperty, propertyUsage } from "@/lib/property-delete";
import { aiAvailable } from "@/lib/ai/provider";
import { LOOKUP_KEY, type LookupMemory } from "@/lib/agent/property-lookup";

export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const store = getStore();
  const property = await store.get("properties", profile.id, params.id);
  if (!property) throw notFound("That property");
  const images = (await store.list("property_images", profile.id)).filter((i) => i.property_id === property.id).sort((a, b) => a.position - b.position);
  const events = (await store.list("calendar_events", profile.id)).filter((e) => e.property_id === property.id);
  const mem = (await store.list("memories", profile.id)).find((m) => m.key === LOOKUP_KEY(property.id));
  let lookup: LookupMemory | null = null; try { lookup = mem ? (JSON.parse(mem.value) as LookupMemory) : null; } catch { /* ignore */ }
  return { property, images, events, lookup, lookupAvailable: aiAvailable(), usage: await propertyUsage(store, profile.id, property.id) };
});

// The agent confirms facts: only then are they used in drafts and posts.
export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson(req);
  const patch: Record<string, unknown> = {};
  const text = { city: 60, state: 30, zip: 12, county: 60, description: 5000, listing_url: 500 } as const;
  const num = { list_price: 2_000_000_000, beds: 100, baths: 100, sqft: 10_000_000 } as const;
  for (const [k, max] of Object.entries(text)) if (k in b) {
    if (b[k] === "" || b[k] == null) { patch[k] = null; continue; }
    if (typeof b[k] !== "string") throw bad(`${k} isn't valid.`);
    patch[k] = cleanText(b[k], max, k === "description");
  }
  for (const [k, max] of Object.entries(num)) if (k in b) {
    if (b[k] === "" || b[k] == null) { patch[k] = null; continue; }
    const n = Number(b[k]);
    if (!Number.isFinite(n) || n < 0 || n > max) throw bad(`${k} isn't valid.`);
    patch[k] = n;
  }
  if (patch.listing_url) { // rendered as a link: web links only (never javascript: or data:)
    try { const u = new URL(String(patch.listing_url)); if (u.protocol !== "http:" && u.protocol !== "https:") throw 0; } catch { throw bad("Listing links must start with http:// or https://."); }
  }
  const p = await getStore().update("properties", profile.id, params.id, patch);
  if (!p) throw notFound("That property");
  return { property: p };
});

// Deleting is permanent and removes everything made for the property, so the client must confirm.
export const DELETE = api<{ id: string }>(async ({ profile, params, url }) => {
  if (url.searchParams.get("confirm") !== "1") throw bad("Deleting needs confirmation.");
  const store = getStore();
  if (!(await store.get("properties", profile.id, params.id))) throw notFound("That property");
  const removed = await deleteProperty(store, profile.id, params.id);
  return { ok: true, removed };
});
