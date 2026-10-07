import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-rt-"));
const env = process.env as Record<string, string | undefined>;
Object.assign(env, { MILA_DATA_DIR: dir, OPENAI_API_KEY: "sk-test", AI_PROVIDER: "openai", RENTCAST_API_KEY: "rc-test", MILA_TIER_LIMITS: JSON.stringify({ free: { listingSearches: 50 } }) }); delete env.ANTHROPIC_API_KEY;
const rcCalls: string[] = []; const aiCalls: any[] = [];
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  const u = new URL(String(url));
  if (u.hostname === "api.rentcast.io") {
    rcCalls.push(u.pathname + "?" + u.searchParams.toString());
    if (u.pathname === "/v1/listings/rental/long-term") return json([
      { id: "r2", addressLine1: "300 Harbor Pt", addressLine2: "Unit 12B", city: "Baltimore", state: "MD", zipCode: "21202", price: 2450, bedrooms: 1, bathrooms: 1, squareFootage: 780, propertyType: "Apartment", daysOnMarket: 6, listedDate: "2026-10-01", latitude: 39.28, longitude: -76.6 },
      { id: "r1", addressLine1: "10 Pier St", city: "Baltimore", state: "MD", zipCode: "21231", price: 2100, bedrooms: 1, bathrooms: 1, propertyType: "Apartment" },
      { id: "r3", addressLine1: "no price", city: "Baltimore", state: "MD" },
    ]);
    if (u.pathname === "/v1/avm/rent/long-term") return json({ rent: 2300, rentRangeLow: 2150, rentRangeHigh: 2480, comparables: [{ formattedAddress: "5 Pier St", price: 2250, bedrooms: 1, bathrooms: 1, squareFootage: 760, distance: 0.1, daysOld: 12 }] });
    if (u.pathname === "/v1/markets") return json({ saleData: { medianPrice: 410000, averageDaysOnMarket: 38, totalListings: 120 }, rentalData: { medianRent: 2050, dataByBedrooms: [{ bedrooms: 1, medianRent: 1900 }] } });
    return json([]);
  }
  if (u.hostname === "geocoding.geo.census.gov") return json({ result: { addressMatches: [] } });
  if (u.hostname === "nominatim.openstreetmap.org") return json(u.pathname.includes("reverse") ? { address: { neighbourhood: "Harbor East", city: "Baltimore", county: "Baltimore City", state: "Maryland" } } : [{ display_name: "Harbor East, Baltimore, Maryland", lat: "39.2834", lon: "-76.5999", address: { "ISO3166-2-lvl4": "US-MD", county: "Baltimore City" } }]);
  if (u.hostname === "hazards.fema.gov") return json({ features: [{ attributes: { FLD_ZONE: "X", ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD" } }] });
  if (u.hostname === "api.openai.com") {
    const body = JSON.parse(init.body); aiCalls.push(body);
    if (!body.previous_response_id) return json({ id: "resp_1", status: "completed", output: [
      { type: "function_call", call_id: "c1", name: "search_rentals", arguments: JSON.stringify({ city: "Baltimore", state: "MD", beds: 1, max_rent: 2500 }) },
      { type: "function_call", call_id: "c2", name: "area_facts", arguments: JSON.stringify({ place: "Harbor East, Baltimore, MD" }) },
      { type: "function_call", call_id: "c3", name: "rent_estimate", arguments: JSON.stringify({ address: "300 Harbor Pt Unit 12B, Baltimore, MD 21202" }) },
    ], usage: { input_tokens: 1000, output_tokens: 300 } });
    return json({ id: "resp_2", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ bottom_line: "300 Harbor Pt Unit 12B fits at $2,450.", facts: [{ label: "Rent", value: "$2,450", source: "RentCast listing" }], shortlist: [], conflicts: [], unverified: ["building reviews"], next: [], question: null }), annotations: [] }] }], usage: { input_tokens: 2500, output_tokens: 400 } });
  }
  return realFetch(url, init);
}) as typeof fetch;

const { createTestStore } = await import("../src/lib/db/store.ts");
const store: any = createTestStore(dir, true);
const { createProfile } = await import("../src/lib/users.ts");
const { handleTurn } = await import("../src/lib/agent/engine.ts");
const p = await createProfile({ email: "agent@realty.com", full_name: "Agent Smith" });
await store.update("profiles", p.id, p.id, { onboarded: true, timezone: "America/New_York" });

test("research pulls real data through tools: rentals with unit numbers, rent estimate, neighbourhood facts", async () => {
  const t = await handleTurn(p, { message: "Find me a 1 bedroom apartment for rent in Baltimore under $2,500, I want to see what is available at Harbor East" });
  assert.match(t.milaMessage.content, /300 Harbor Pt Unit 12B/);
  // the model's tool calls hit the data sources with the right filters
  const rental = rcCalls.find((c) => c.startsWith("/v1/listings/rental/long-term"))!;
  assert.match(rental, /city=Baltimore/); assert.match(rental, /state=MD/); assert.match(rental, /bedrooms=1/); assert.match(rental, /price=\*(%3A|:)2500/);
  assert.ok(rcCalls.some((c) => c.startsWith("/v1/avm/rent/long-term") && /Unit(\+|%20)12B/.test(c)), "unit-level address passed through");
  // second round hands back every tool result with the response id
  const second = aiCalls.at(-1);
  assert.equal(second.previous_response_id, "resp_1");
  assert.equal(second.input.length, 3);
  const outputs = second.input.map((i: any) => ({ id: i.call_id, v: JSON.parse(i.output) }));
  assert.equal(outputs.find((o: any) => o.id === "c1").v.rentals[0].rent, 2100);
  assert.equal(outputs.find((o: any) => o.id === "c1").v.rentals[1].unit, "Unit 12B");
  assert.equal(outputs.find((o: any) => o.id === "c1").v.count, 2, "listings without a price are dropped");
  const area = outputs.find((o: any) => o.id === "c2").v;
  assert.equal(area.flood.zone, "X"); assert.equal(area.neighborhood.neighborhood, "Harbor East"); assert.ok(area.not_available.some((x: string) => /Walk Score/.test(x)), "says what it could not check");
  assert.equal(outputs.find((o: any) => o.id === "c3").v.rent, 2300);
  // cost is metered for both rounds, and the paid data calls are counted against the allowance
  const usage = (await store.list("usage", p.id)).find((u: any) => u.operation === "client_search");
  assert.equal(usage.input_units, 3500); assert.equal(usage.output_units, 700);
  const api = (await store.list("api_usage", p.id)).filter((a: any) => a.provider === "rentcast");
  assert.equal(api.length, 2);
});

test("a tool that can't run says why instead of failing the whole answer", async () => {
  const { researchRunner } = await import("../src/lib/agent/research-tools.ts");
  const ctx: any = { userId: p.id, steps: [], store };
  delete env.RENTCAST_API_KEY;
  const out: any = await researchRunner(ctx)("search_rentals", { city: "Austin", state: "TX" });
  assert.match(out.error, /isn't connected/);
  env.RENTCAST_API_KEY = "rc-test";
});
