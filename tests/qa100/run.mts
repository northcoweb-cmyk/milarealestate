/**
 * Runs the 100 scenarios through the real agent engine with the outside world mocked (RentCast, OpenAI, Google), so we can see what Mila
 * actually answers and which data she reaches for. Prints a digest and writes /tmp/qa100.json. Not a pass/fail test: a map of gaps.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const env = process.env as Record<string, string | undefined>;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-qa100-"));
env.MILA_DATA_DIR = dir; env.OPENAI_API_KEY = "sk-test"; env.AI_PROVIDER = "openai"; env.RENTCAST_API_KEY = "rc-test"; env.GOOGLE_MAPS_API_KEY = "g-test"; delete env.ANTHROPIC_API_KEY;
(globalThis as any).__milaNow = new Date("2026-10-07T14:00:00Z");
const calls: { host: string; path: string; body?: any }[] = [];
const realFetch = globalThis.fetch;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (url: any, init: any) => {
  const u = new URL(String(url));
  if (u.hostname === "api.rentcast.io") {
    calls.push({ host: "rentcast", path: u.pathname + u.search });
    if (u.pathname === "/v1/properties") return json([{ addressLine1: (u.searchParams.get("address") ?? "").split(",")[0], city: "Austin", state: "TX", zipCode: "78704", bedrooms: 3, bathrooms: 2, squareFootage: 1850, yearBuilt: 1998, propertyType: "Single Family", lastSalePrice: 512000, lastSaleDate: "2021-06-01", latitude: 30.24, longitude: -97.76, propertyTaxes: { "2024": { total: 8120 } } }]);
    if (u.pathname === "/v1/listings/sale") return json([{ addressLine1: "100 Main St", city: "Rockville", state: "MD", zipCode: "20850", price: 515000, bedrooms: 3, bathrooms: 2.5, squareFootage: 1900, propertyType: "Townhouse", daysOnMarket: 3, listedDate: "2026-10-04", id: "x1", mlsName: "Bright MLS", mlsNumber: "MD123", listingAgent: { name: "Pat Lee" }, listingOffice: { name: "Acme Realty" }, latitude: 39.08, longitude: -77.15 }]);
    if (u.pathname === "/v1/avm/value") return json({ price: 530000, priceRangeLow: 500000, priceRangeHigh: 560000, comparables: [{ formattedAddress: "102 Main St", price: 520000, bedrooms: 3, bathrooms: 2, squareFootage: 1800, distance: 0.2 }] });
    return json({ error: "not mocked" }, 404);
  }
  if (u.hostname === "maps.googleapis.com") { calls.push({ host: "google", path: u.pathname }); return json({ status: "OK", results: [{ formatted_address: "123 Main St, Rockville, MD 20850, USA", geometry: { location: { lat: 39.08, lng: -77.15 } }, address_components: [{ long_name: "Rockville", short_name: "Rockville", types: ["locality"] }, { long_name: "Maryland", short_name: "MD", types: ["administrative_area_level_1"] }, { long_name: "20850", short_name: "20850", types: ["postal_code"] }] }] }); }
  if (u.hostname === "api.openai.com") {
    const body = JSON.parse(init.body); calls.push({ host: "openai", path: u.pathname, body: { model: body.model, effort: body.reasoning?.effort, web: JSON.stringify(body.tools ?? []).includes("web_search"), tool: body.tool_choice?.name ?? body.tool_choice?.function?.name } });
    const fn = body.tool_choice?.name ?? body.tool_choice?.function?.name;
    if (fn === "route") return json({ status: "completed", output: [{ type: "function_call", name: "route", arguments: JSON.stringify({ intent: "general" }) }], usage: { input_tokens: 50, output_tokens: 10 } });
    if (fn === "reply") return json({ status: "completed", output: [{ type: "function_call", name: "reply", arguments: JSON.stringify({ reply: "[AI chat answer]", actions: [] }) }], usage: { input_tokens: 800, output_tokens: 300 } });
    const text = JSON.stringify({ bottom_line: "[AI research answer]", requirements: [], conflicts: [], shortlist: [], unverified: [], next: [], question: null, bullets: ["[AI market bullet]"], dataPeriod: "now", caveat: "" });
    return json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text, annotations: [{ type: "url_citation", url: "https://example.com/src", title: "Source" }] }] }], usage: { input_tokens: 900, output_tokens: 400 } });
  }
  return realFetch(url, init);
}) as typeof fetch;

const { createTestStore } = await import("../../src/lib/db/store.ts");
const store: any = createTestStore(dir, true);
const { createProfile } = await import("../../src/lib/users.ts");
const { handleTurn } = await import("../../src/lib/agent/engine.ts");
const { SCENARIOS } = await import("./scenarios.ts");

const prof = await createProfile({ email: "team@realty.com", full_name: "Taylor Agent" });
await store.update("profiles", prof.id, prof.id, { onboarded: true, timezone: "America/New_York", location: "Rockville, MD", primary_market: "Montgomery County, MD", brokerage: "Acme Realty" });
let profile = await store.get("profiles", prof.id, prof.id);
for (const m of ["I have a new buyer named Aisha Rahman looking for a 3 bedroom townhome in Gaithersburg around $560k in the next 6 weeks", "I have a new buyer named Priya Patel looking for a condo in Bethesda around $450k", "Add my listing 22 Elm Court Bethesda MD, 3 bed 2 bath, $650k", "I have a new buyer named Marcus Webb looking for a house in Frederick under $500k"]) await handleTurn(profile, { message: m });

const results: any[] = [];
for (const [i, s] of SCENARIOS.entries()) {
  calls.length = 0;
  let r: any, err: string | null = null;
  try { r = await handleTurn(profile, { message: s.q }); } catch (e) { err = e instanceof Error ? e.message : String(e); }
  const text: string = r?.milaMessage?.content ?? "";
  const blocks: string[] = (r?.milaMessage?.blocks ?? []).map((b: any) => b.type);
  const hosts = [...new Set(calls.map((c) => c.host))];
  results.push({ i: i + 1, group: s.group, q: s.q, data: s.data, text, blocks, hosts, models: [...new Set(calls.filter((c) => c.host === "openai").map((c) => `${c.body.model}${c.body.effort ? "/" + c.body.effort : ""}${c.body.web ? "+web" : ""}`))], err });
}
fs.writeFileSync("/tmp/qa100.json", JSON.stringify(results, null, 1));
const bad = /can'?t|couldn'?t|isn'?t (?:set up|connected|available)|not (?:set up|connected|sure)|I'm not sure|MLS|connection/i;
let withData = 0, ai = 0, stuck = 0, errs = 0;
for (const x of results) {
  if (x.err) errs++;
  if (x.hosts.includes("rentcast") || x.hosts.includes("google")) withData++;
  if (x.hosts.includes("openai")) ai++;
  if (bad.test(x.text)) stuck++;
}
console.log(`ran ${results.length}; errors ${errs}; pulled outside data ${withData}; used AI ${ai}; replies that say they can't / need a connection ${stuck}`);
for (const x of results) console.log(`${String(x.i).padStart(3)} ${x.err ? "ERR " : bad.test(x.text) ? "STUCK" : "ok   "} [${x.hosts.join("+") || "-"}] ${x.models.join(",")} | ${x.q.slice(0, 58)} => ${x.text.replace(/\s+/g, " ").slice(0, 90)}`);
