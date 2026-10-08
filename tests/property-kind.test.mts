import test from "node:test";
import assert from "node:assert/strict";
import { classifyProperty, kindFacts, kindMissing } from "../src/lib/property-kind.ts";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
test("residential, multifamily, commercial and land are told apart", () => {
  assert.equal(classifyProperty({ address: "12 Oak St", beds: 3, baths: 2 }).group, "residential");
  assert.equal(classifyProperty({ address: "12 Oak St", typeHint: "Condo" }).label, "Condo");
  assert.equal(classifyProperty({ address: "12 Oak St", typeHint: "Townhouse" }).label, "Townhome");
  assert.equal(classifyProperty({ agentText: "Add a duplex at 12 Oak St" }).label, "Duplex");
  assert.equal(classifyProperty({ typeHint: "Multi-Family" }).group, "multifamily");
  assert.equal(classifyProperty({ agentText: "It's a 12-unit apartment building" }).group, "commercial");
  assert.equal(classifyProperty({ agentText: "new commercial listing at 500 Main St, retail space" }).label, "Retail space");
  assert.equal(classifyProperty({ agentText: "warehouse on 9 Industrial Way" }).label, "Industrial / warehouse");
  assert.equal(classifyProperty({ agentText: "It's 20 acres of vacant land" }).group, "land");
  assert.equal(classifyProperty({ typeHint: "Land" }).group, "land");
  assert.equal(classifyProperty({ address: "400 Broad St, Suite 200" }).group, "commercial");
  assert.equal(classifyProperty({ address: "400 Broad St #12" }).label, "Condo");
});
test("a street named Lake or Farm does not make it land", () => {
  assert.equal(classifyProperty({ agentText: "Add a listing at 12 Lake Rd, 3 bed 2 bath", beds: 3, baths: 2 }).group, "residential");
  assert.equal(classifyProperty({ agentText: "Showing at 88 Farm Rd" }).group, "unknown");
});
test("commercial asks for the right things and never for beds and baths", () => {
  const k = classifyProperty({ agentText: "commercial retail at 500 Main St" });
  const miss = kindMissing(k, { list_price: null, sqft: null, beds: null, baths: null });
  assert.ok(miss.includes("zoning") && miss.includes("building square feet") && !miss.includes("beds") && !miss.includes("baths"), miss.join());
  assert.deepEqual(kindFacts(k, { beds: 3, baths: 2, sqft: 4200, list_price: 1250000 }, money), ["4,200 sq ft", "Asking $1,250,000"]);
  const home = classifyProperty({ beds: 3, baths: 2 });
  assert.deepEqual(kindMissing(home, { list_price: null, sqft: null, beds: 3, baths: 2 }), ["price", "square feet"]);
});
