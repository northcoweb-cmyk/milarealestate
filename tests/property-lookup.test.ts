import test from "node:test";
import assert from "node:assert/strict";
import { describeFacts, extractPlace } from "../src/lib/agent/property-lookup";

test("city, state and ZIP are read from natural phrasing", () => {
  assert.deepEqual(extractPlace("123 Main Street, Gaithersburg, MD 20877"), { zip: "20877", city: "Gaithersburg", state: "MD" });
  assert.deepEqual(extractPlace("I have an open house at 910 Pine Road Sunday at 2 PM Frederick, MD"), { city: "Frederick", state: "MD" });
  assert.deepEqual(extractPlace("open house at 5 Elm Street in Rockville MD"), { city: "Rockville", state: "MD" });
  assert.deepEqual(extractPlace("14 Birch Court, Bethesda, Maryland Saturday at 11 AM"), { state: "MD", city: "Bethesda" });
  assert.equal(extractPlace("open house at 22 Cedar Drive 20814 Sunday at 4 PM").zip, "20814");
  assert.deepEqual(extractPlace("77 Elm Street, New York, NY"), { city: "New York", state: "NY" });
});

test("a bare street, a time, or a price is not mistaken for a place", () => {
  assert.deepEqual(extractPlace("I have an open house at 123 Main Street Sunday at 1 PM"), {});
  assert.deepEqual(extractPlace("showing at 456 Oak Lane tomorrow at 3 PM, offer is $650,000"), {});
  assert.equal(extractPlace("meet me in the morning at 10 Pine Road").state, undefined); // "in" / "or" / "me" are words, not states
});

test("looked-up facts are described plainly", () => {
  assert.equal(describeFacts({ beds: 3, baths: 2.5, sqft: 2150, list_price: 589000, year_built: null, status: null, type: null }), "3 bd · 2.5 ba · 2,150 sq ft · $589,000");
  assert.equal(describeFacts(null), "");
});

import { geocode } from "../src/lib/agent/property-lookup";
const realFetch = globalThis.fetch;
const google = (body: unknown) => { globalThis.fetch = (async () => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })) as typeof fetch; };
const comp = (long: string, types: string[], short = long) => ({ long_name: long, short_name: short, types });

test("a real address is never rejected: missing street number or an unknown-key reply still goes through", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  try {
    // Google knows the street but not the exact number (new builds, rural roads)
    google({ status: "OK", results: [{ formatted_address: "Pine Rd, Frederick, MD 21701", partial_match: true, types: ["route"], address_components: [comp("Pine Road", ["route"]), comp("Frederick", ["locality"]), comp("Maryland", ["administrative_area_level_1"], "MD"), comp("21701", ["postal_code"])], geometry: { location: { lat: 39.4, lng: -77.4 }, location_type: "GEOMETRIC_CENTER" } }] });
    const a = await geocode("910 Pine Road", { city: "Frederick", state: "MD" });
    assert.ok(a && a !== "not_found");
    { assert.equal((a as { street: string }).street, "910 Pine Road"); assert.equal((a as { zip: string }).zip, "21701"); assert.equal((a as { exact: boolean }).exact, false); }
    // exact rooftop match fills everything
    google({ status: "OK", results: [{ formatted_address: "x", types: ["street_address"], address_components: [comp("123", ["street_number"]), comp("Main Street", ["route"]), comp("Gaithersburg", ["locality"]), comp("Maryland", ["administrative_area_level_1"], "MD"), comp("20877", ["postal_code"]), comp("Montgomery County", ["administrative_area_level_2"])], geometry: { location: { lat: 39.1, lng: -77.2 }, location_type: "ROOFTOP" } }] });
    const b = await geocode("123 Main Street", { city: "Gaithersburg", state: "MD" });
    assert.ok(b && b !== "not_found");
    assert.equal((b as { exact: boolean }).exact, true); assert.equal((b as { county: string }).county, "Montgomery");
    // a key that isn't allowed to geocode must not block the user
    google({ status: "REQUEST_DENIED", results: [] });
    assert.equal(await geocode("123 Main Street", { city: "Gaithersburg", state: "MD" }), null);
    // only a clear "no such place" counts as not found
    google({ status: "ZERO_RESULTS", results: [] });
    assert.equal(await geocode("1 Nowhere Lane", { city: "Gaithersburg", state: "MD" }), "not_found");
  } finally { globalThis.fetch = realFetch; delete process.env.GOOGLE_MAPS_API_KEY; }
});
