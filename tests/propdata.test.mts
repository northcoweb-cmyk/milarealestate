// Property & listing data: "prep for <address>" and "what's new in my area", against a mocked RentCast.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-pd-"));
process.env.MILA_DATA_DIR = dir;
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.GOOGLE_MAPS_API_KEY;
process.env.RENTCAST_API_KEY = "rc-test";
(globalThis as any).__milaNow = new Date("2026-10-05T14:00:00Z");

const calls: { path: string; q: URLSearchParams; key: string | null }[] = [];
const LISTINGS = Array.from({ length: 10 }, (_, i) => ({ id: `L${i}`, addressLine1: `${100 + i} Maple Avenue`, formattedAddress: `${100 + i} Maple Avenue, Bethesda, MD 20814`, city: "Bethesda", state: "MD", zipCode: "20814", price: 600000 + i * 25000, bedrooms: 3 + (i % 3), bathrooms: 2, squareFootage: 1800 + i * 50, propertyType: "Single Family", daysOnMarket: i, listedDate: `2026-10-0${Math.max(1, 5 - Math.floor(i / 2))}T00:00:00.000Z`, mlsName: "Bright MLS", mlsNumber: `MD${i}`, listingAgent: { name: "Pat Lee" }, listingOffice: { name: "Keller Williams" }, latitude: 38.98, longitude: -77.1 }));
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.rentcast.io") return realFetch(url, init);
  calls.push({ path: u.pathname, q: u.searchParams, key: init?.headers?.["X-Api-Key"] ?? null });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (u.pathname === "/v1/properties") return json(u.searchParams.get("address")?.includes("Nowhere") ? [] : [{ addressLine1: "1231 Main Street", city: "Bethesda", state: "MD", zipCode: "20814", county: "Montgomery", bedrooms: 4, bathrooms: 2.5, squareFootage: 2310, lotSize: 7405, yearBuilt: 1962, propertyType: "Single Family", lastSaleDate: "2025-12-01T00:00:00.000Z", lastSalePrice: 640000, propertyTaxes: { "2024": { total: 7400 }, "2025": { total: 7812 } }, features: { garageSpaces: 2, pool: false, floorCount: 2 } }]);
  if (u.pathname === "/v1/avm/value") return json({ price: 735000, priceRangeLow: 700000, priceRangeHigh: 770000 });
  if (u.pathname === "/v1/listings/sale") return u.searchParams.get("address") ? json(u.searchParams.get("address")!.includes("1231 Main") ? [{ ...LISTINGS[0], addressLine1: "1231 Main Street", price: 799000, daysOnMarket: 41, bedrooms: 4, bathrooms: 2.5, squareFootage: 2310, status: "Active" }] : []) : json(LISTINGS);
  return json({}, 404);
}) as typeof fetch;

const { newAgent, blocks, store } = await import("./qa/harness.mts");
const { clearRentcastCache } = await import("../src/lib/listing-data/rentcast.ts");
const now = new Date("2026-10-05T14:00:00Z");
const say = (a: any, m: string) => a.say(m);

test("prep for an address pulls the record, listing and estimate and answers with a card, numbers and what to watch", async () => {
  clearRentcastCache();
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const r = await say(a, "I need to prep for 1231 Main Street, Bethesda, MD");
  const t = r.milaMessage.content as string;
  assert.match(t, /Here's what I pulled on 1231 Main Street, Bethesda/);
  assert.match(t, /4 bd · 2\.5 ba · 2,310 sq ft · built 1962/);
  assert.match(t, /Active listing at \$799,000, 41 days on market/);
  assert.match(t, /Estimated value \$735,000 \(range \$700,000–\$770,000\)/);
  assert.match(t, /Last sold \$640,000/);
  assert.match(t, /Property taxes about \$7,812 \(2025\)/);
  assert.match(t, /9% above the \$735,000 automated estimate/);
  assert.match(t, /41 days on market — expect questions/);
  assert.match(t, /Built in 1962/);
  assert.match(t, /Source: RentCast property data\. Check it before you quote it/);
  const rail = blocks(r, "listings")[0];
  assert.equal(rail.cards.length, 1);
  assert.equal(rail.cards[0].price, 799000);
  assert.equal(rail.cards[0].beds, 4);
  assert.ok(calls.every((c) => c.key === "rc-test"), "key sent as X-Api-Key");
  const [p] = await store.list("properties", a.id);
  assert.deepEqual([p.beds, p.baths, p.sqft, p.list_price, p.zip], [4, 2.5, 2310, 799000, "20814"], "saved onto the property");
  assert.equal(p.verified, false, "pulled data stays unconfirmed until the agent confirms it");
});

test("asking twice doesn't spend another lookup", async () => {
  clearRentcastCache();
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await say(a, "Prep for 1231 Main Street, Bethesda, MD");
  const n = calls.length;
  await say(a, "Tell me about 1231 Main Street, Bethesda, MD");
  assert.equal(calls.length, n, "second ask served from the saved lookup");
});

test("an address RentCast doesn't know is saved and said plainly, not invented", async () => {
  clearRentcastCache();
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const r = await say(a, "Prep for 9 Nowhere Lane");
  assert.match(r.milaMessage.content, /saved 9 Nowhere Lane, but I couldn't find its details/);
  assert.doesNotMatch(r.milaMessage.content, /\$\d/);
});

test("what's new in my area returns up to 7 listing cards, newest first, with filters applied", async () => {
  clearRentcastCache();
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await store.update("profiles", a.id, a.id, { location: "Bethesda, MD" }); (a.profile as any).location = "Bethesda, MD";
  calls.length = 0;
  const r = await say(a, "What listings are new in my area?");
  const rail = blocks(r, "listings")[0];
  assert.equal(rail.cards.length, 7);
  assert.equal(rail.title, "New in Bethesda, MD");
  const dates = rail.cards.map((c: any) => c.listed_date);
  assert.deepEqual([...dates].sort().reverse(), dates, "newest first");
  const q = calls.find((c) => c.path === "/v1/listings/sale")!.q;
  assert.equal(q.get("city"), "Bethesda"); assert.equal(q.get("state"), "MD"); assert.equal(q.get("status"), "Active"); assert.equal(q.get("daysOld"), "*:7");
  const r2 = await say(a, "Show me new 4 bedroom homes in Rockville, MD under 700k from the last 2 weeks");
  const q2 = calls.filter((c) => c.path === "/v1/listings/sale").pop()!.q;
  assert.equal(q2.get("city"), "Rockville"); assert.equal(q2.get("bedrooms"), "4:*"); assert.equal(q2.get("price"), "*:700000"); assert.equal(q2.get("daysOld"), "*:14");
  assert.match(r2.milaMessage.content, /4\+ bd/);
});

test("the Save button on a card saves the home to the agent's properties, validating what the browser sent", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const r = await a.act({ type: "save_listing", card: { address: "104 Maple Avenue", city: "Bethesda", state: "md", zip: "20814", price: 650000, beds: 3, baths: 2, sqft: 1850 } });
  assert.match(r.milaMessage.content, /Saved 104 Maple Avenue, Bethesda/);
  const [p] = await store.list("properties", a.id);
  assert.deepEqual([p.state, p.list_price, p.beds], ["MD", 650000, 3]);
  const bad = await a.act({ type: "save_listing", card: { address: "no number here", price: -5 } });
  assert.match(bad.milaMessage.content, /couldn't read/);
  const junk = await a.act({ type: "save_listing", card: { address: "5 Elm St", price: 9e99, beds: "lots", state: "<script>" } });
  const props = await store.list("properties", a.id);
  const j = props.find((x: any) => x.address === "5 Elm St");
  assert.ok(!j || (j.list_price == null && j.beds == null), "out-of-range numbers are dropped, not stored");
  void junk;
});

test("without a key, new-listings explains itself instead of guessing, and prep still saves the address", async () => {
  const saved = process.env.RENTCAST_API_KEY; delete process.env.RENTCAST_API_KEY;
  try {
    const a = await newAgent({ now, tz: "America/New_York", seed: false });
    const r = await say(a, "What's new on the market near me?");
    assert.match(r.milaMessage.content, /isn't connected on this server yet/);
    assert.equal(blocks(r, "listings").length, 0);
    const p = await say(a, "Prep for 55 Pine Road");
    assert.match(p.milaMessage.content, /saved 55 Pine Road/);
  } finally { process.env.RENTCAST_API_KEY = saved; }
});

test("automatic lookups use 1 RentCast request; only a full prep uses 3 (cost control)", async () => {
  clearRentcastCache();
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  calls.length = 0;
  await say(a, "New listing at 1231 Main Street, Bethesda, MD");
  assert.deepEqual(calls.map((c) => c.path), ["/v1/properties"], "saving a listing only reads the public record");
  calls.length = 0;
  await say(a, "Prep for 1231 Main Street, Bethesda, MD");
  assert.deepEqual(calls.map((c) => c.path).sort(), ["/v1/avm/value", "/v1/listings/sale", "/v1/properties"], "prep upgrades it with the listing and estimate");
  calls.length = 0;
  await say(a, "Prep for 1231 Main Street, Bethesda, MD");
  assert.equal(calls.length, 0, "and a repeat is free");
  const usage = (await store.list("usage", a.id)).filter((u: any) => u.provider === "rentcast");
  assert.deepEqual(usage.map((u: any) => u.operation).sort(), ["property_lookup", "property_prep"]);
  assert.ok(Math.abs(usage.find((u: any) => u.operation === "property_prep").est_cost_usd - 3 * 0.074) < 1e-9);
});

test("several RentCast keys share the load and a used-up key is skipped", async () => {
  const { resetRentcastKeys, rentcastKeys } = await import("../src/lib/listing-data/rentcast.ts");
  const saved = { a: process.env.RENTCAST_API_KEY, b: process.env.RENTCAST_API_KEY1, c: process.env.RENTCAST_API_KEY2 };
  process.env.RENTCAST_API_KEY = "key-main"; process.env.RENTCAST_API_KEY1 = "key-one"; process.env.RENTCAST_API_KEY2 = "key-main, key-extra";
  assert.deepEqual(rentcastKeys(), ["key-main", "key-one", "key-extra"], "all sources merged, duplicates removed");
  // "key-one" is out of requests (429); everything else works
  const prev = globalThis.fetch;
  const used: string[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    const u = new URL(String(url));
    if (u.hostname === "api.rentcast.io") { const k = init.headers["X-Api-Key"]; used.push(k); if (k === "key-one") return new Response("{}", { status: 429 }); return new Response(JSON.stringify(LISTINGS), { status: 200 }); }
    return prev(url, init);
  }) as typeof fetch;
  try {
    clearRentcastCache(); resetRentcastKeys();
    const { newListings } = await import("../src/lib/listing-data/rentcast.ts");
    for (let i = 0; i < 6; i++) { clearRentcastCache(); assert.ok((await newListings({ city: "Bethesda", state: "MD" })).length > 0, "every search still succeeds"); }
    const ok = used.filter((k) => k !== "key-one");
    assert.ok(new Set(ok).size === 2, "load spread over the two working keys");
    assert.equal(used.filter((k) => k === "key-one").length, 1, "the used-up key is tried once, then benched");
    // every key exhausted → a clean 'limit' error, not a crash
    globalThis.fetch = (async (url: any, init: any) => (new URL(String(url)).hostname === "api.rentcast.io" ? new Response("{}", { status: 429 }) : prev(url, init))) as typeof fetch;
    clearRentcastCache(); resetRentcastKeys();
    await assert.rejects(() => newListings({ city: "Bethesda", state: "MD" }), (e: any) => e.code === "limit");
  } finally { globalThis.fetch = prev; resetRentcastKeys(); process.env.RENTCAST_API_KEY = saved.a!; if (saved.b === undefined) delete process.env.RENTCAST_API_KEY1; else process.env.RENTCAST_API_KEY1 = saved.b; if (saved.c === undefined) delete process.env.RENTCAST_API_KEY2; else process.env.RENTCAST_API_KEY2 = saved.c; }
});
