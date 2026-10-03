import { rateLimit } from "@/lib/server/rate-limit";
import { api, bad, notFound, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { ensureCredits } from "@/lib/credits";
import { describeFacts, enrichProperty, extractPlace, geocode } from "@/lib/agent/property-lookup";

export const maxDuration = 60;

// "Find this home": completes the address (geocoder) and prefills beds / baths / size / price from listing sites.
export const POST = api<{ id: string }>(async ({ profile, params, req }) => {
  rateLimit(`lookup:${profile.id}`, 12);
  const b = await readJson<{ street?: string; city?: string; state?: string; zip?: string }>(req).catch(() => ({} as { street?: string; city?: string; state?: string; zip?: string }));
  const ctx = await buildCtx(profile);
  let prop = await ctx.store.get("properties", profile.id, params.id);
  if (!prop) throw notFound("That property");
  // the agent can correct / complete the address first
  const patch: Record<string, unknown> = {};
  if (b.street && b.street.trim() && b.street.trim() !== prop.address) patch.address = b.street.trim().slice(0, 160);
  for (const k of ["city", "state", "zip"] as const) if (typeof b[k] === "string" && b[k]!.trim()) patch[k] = b[k]!.trim().slice(0, 60);
  if (Object.keys(patch).length) prop = (await ctx.store.update("properties", profile.id, prop.id, patch as never)) ?? prop;
  const place = { city: prop.city, state: prop.state, zip: prop.zip, ...extractPlace(`${prop.address}, ${prop.city ?? ""} ${prop.state ?? ""} ${prop.zip ?? ""}`) };
  if (!((place.city && place.state) || place.zip)) throw bad("Add the city and state (or ZIP) first so I can find the right home.");
  const g = await geocode(prop.address, place);
  if (g === "not_found") throw bad("I couldn't find that address on the map. Check the street number and name, then try again.");
  const geoPlace = g ? { city: g.city, state: g.state, zip: g.zip, county: g.county } : place;
  if (g && (!prop.city || !prop.state || !prop.zip || !prop.county)) prop = (await ctx.store.update("properties", profile.id, prop.id, { city: prop.city ?? g.city, state: prop.state ?? g.state, zip: prop.zip ?? g.zip, county: prop.county ?? g.county } as never)) ?? prop;
  await ensureCredits(profile.id, 3);
  const r = await enrichProperty(ctx, prop, { place: geoPlace, force: true });
  const m = r.memory;
  return { property: r.property, lookup: m, message: m?.found ? `Found ${describeFacts(m.facts) || "details"}.` : m?.note === "no_ai" ? "Lookup isn't available right now, but your address is saved. Add the details by hand." : "I couldn't find this exact home. Add the details by hand." };
});
