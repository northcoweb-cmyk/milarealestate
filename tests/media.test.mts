// Listing photo system: matching, caching, de-duplication, cost tracking, limits and failure isolation - against a mocked Zillapi.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-media-"));
process.env.MILA_DATA_DIR = dir;
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.GOOGLE_MAPS_API_KEY;
process.env.ZILLAPI_API_KEY = "zk_SECRET_TEST_KEY"; process.env.PHOTO_PROVIDER = "zillapi";
(globalThis as any).__milaNow = new Date("2026-10-05T14:00:00Z");

const calls: { path: string; auth: string | null; address?: string }[] = [];
let mode: "ok" | "neighbor" | "credits" | "empty" = "ok";
const realFetch = globalThis.fetch;
const photoBody = { data: [{ url: "https://photos.zillowstatic.com/fp/a-p_d.jpg", caption: "Front", mixedSources: { jpeg: [{ url: "https://photos.zillowstatic.com/fp/a-192.jpg", width: 192 }, { url: "https://photos.zillowstatic.com/fp/a-384.jpg", width: 384 }, { url: "https://photos.zillowstatic.com/fp/a-1536.jpg", width: 1536 }] } }, { url: "https://photos.zillowstatic.com/fp/b.jpg", mixedSources: { jpeg: [] } }, { url: "http://insecure.example/x.jpg" }], meta: { count: 3 } };
globalThis.fetch = (async (url: any, init: any) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.zillapi.com") return realFetch(url, init);
  calls.push({ path: u.pathname, auth: init?.headers?.authorization ?? null, address: u.searchParams.get("address") ?? undefined });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  await new Promise((r) => setTimeout(r, 15));
  if (mode === "credits") return json({ error: "no credits" }, 402);
  if (u.pathname === "/v1/properties/by-address") {
    const a = u.searchParams.get("address") ?? "";
    if (/Nowhere/.test(a)) return json({}, 404);
    const num = mode === "neighbor" ? "1233" : /^(\d+)/.exec(a)![1];
    return json({ data: { zpid: `Z${num}`, address: { streetAddress: `${num} Main Street`, city: "Bethesda", state: "MD", zipcode: "20814" } } });
  }
  if (/\/photos$/.test(u.pathname)) return mode === "empty" ? json({ data: [], meta: { count: 0 } }) : json(photoBody);
  return json({}, 404);
}) as typeof fetch;

const { createTestStore } = await import("../src/lib/db/store.ts");
const store: any = createTestStore(dir);
const { createProfile } = await import("../src/lib/users.ts");
const { addressKey, sameHome, normalizeStreet } = await import("../src/lib/media/address.ts");
const { getListingMedia, peekMedia, resetMediaMemo } = await import("../src/lib/media/service.ts");
const { usageFor, resetUsageMemo } = await import("../src/lib/media/usage.ts");
const { parsePhotos } = await import("../src/lib/media/providers/zillapi.ts");
const { parseRapidPhotos } = await import("../src/lib/media/providers/rapidapi.ts");

const user = await createProfile({ email: "agent@example.com", full_name: "Test Agent" });
const home = (n: number) => ({ address: `${n} Main Street`, city: "Bethesda", state: "MD", zip: "20814", propertyId: `p${n}` });
const reset = () => { calls.length = 0; mode = "ok"; resetMediaMemo(); resetUsageMemo(); };

test("addresses normalize: abbreviations, units, punctuation, ZIP+4", () => {
  assert.equal(normalizeStreet("123 N. Main Street, Apt 4B").street, "123 N MAIN ST");
  assert.equal(addressKey({ address: "123 north main st.", city: "bethesda", state: "md", zip: "20814-1234" }), addressKey({ address: "123 N Main Street", city: "Bethesda", state: "MD", zip: "20814" }));
  assert.notEqual(addressKey({ address: "123 Main St", city: "A", state: "MD" }), addressKey({ address: "125 Main St", city: "A", state: "MD" }));
  assert.notEqual(addressKey({ address: "123 Main St Unit 2", city: "A", state: "MD" }), addressKey({ address: "123 Main St Unit 3", city: "A", state: "MD" }));
});

test("sameHome never matches a neighbour or a different unit/ZIP", () => {
  const a = { address: "1231 Main Street", city: "Bethesda", state: "MD", zip: "20814" };
  assert.ok(sameHome(a, { ...a, address: "1231 Main St." }));
  assert.ok(!sameHome(a, { ...a, address: "1233 Main Street" }));
  assert.ok(!sameHome(a, { ...a, address: "1231 Main Street Unit 4" }));
  assert.ok(!sameHome(a, { ...a, zip: "20815" }));
  assert.ok(!sameHome(a, { ...a, address: "1231 Maine Street" }));
});

test("photo parsing: HTTPS only, small thumb + large image, bounded", () => {
  const p = parsePhotos(photoBody);
  assert.equal(p.length, 2, "http:// url dropped");
  assert.match(p[0].thumbUrl!, /a-384/); assert.match(p[0].url, /a-1536/); assert.equal(p[0].sortOrder, 0); assert.equal(p[1].sortOrder, 1);
  assert.deepEqual(parseRapidPhotos({ primary_photo: { href: "https://x/1.jpg" }, photos: [{ href: "https://x/1.jpg" }, { href: "https://x/2.jpg" }, "http://bad/3.jpg"] }).map((x: any) => x.url), ["https://x/1.jpg", "https://x/2.jpg"]);
});

test("first request: address lookup (3) + photos (1) = 4 credits; second request is a free cache hit", async () => {
  reset();
  const m = await getListingMedia(user.id, home(1231), { fetch: true });
  assert.equal(m.photoStatus, "ok"); assert.equal(m.photos.length, 2); assert.equal(m.providerPropertyId, "Z1231"); assert.equal(m.cached, false);
  assert.deepEqual(calls.map((c) => c.path), ["/v1/properties/by-address", "/v1/properties/Z1231/photos"]);
  assert.equal(calls[0].auth, "Bearer zk_SECRET_TEST_KEY");
  const u = await usageFor(user.id);
  assert.equal(u.photoApiRequests, 2); assert.equal(u.photoEnrichments, 1); assert.equal(u.estCostUsd, 0.02, "4 credits x $0.005");
  calls.length = 0;
  const again = await getListingMedia(user.id, home(1231), { fetch: true });
  assert.equal(again.cached, true); assert.equal(again.photos.length, 2); assert.equal(calls.length, 0, "no provider call on a cache hit");
  assert.equal((await peekMedia(home(1231)))?.photoStatus, "ok");
  assert.equal(calls.length, 0);
  assert.ok(!JSON.stringify(m).includes("SECRET"), "key never appears in what the app returns");
  const rows = (await store.listAll("listing_media_cache")).filter((r: any) => r.normalized_address.startsWith("1231 MAIN"));
  assert.equal(rows.length, 1, "one row per home/provider");
});

test("a known ZPID skips the 3-credit address lookup", async () => {
  reset();
  const m = await getListingMedia(user.id, { ...home(5000), providerPropertyId: "Z777" }, { fetch: true });
  assert.equal(m.photoStatus, "ok"); assert.deepEqual(calls.map((c) => c.path), ["/v1/properties/Z777/photos"]);
});

test("simultaneous requests for the same home share one provider call", async () => {
  reset();
  const r = await Promise.all(Array.from({ length: 6 }, () => getListingMedia(user.id, home(2000), { fetch: true })));
  assert.ok(r.every((x) => x.photoStatus === "ok"));
  assert.equal(calls.filter((c) => c.path.endsWith("by-address")).length, 1);
  assert.equal(calls.length, 2);
});

test("cache-only mode never calls the provider", async () => {
  reset();
  const m = await getListingMedia(user.id, home(3000), { fetch: false });
  assert.equal(m.photoStatus, "pending"); assert.equal(calls.length, 0);
});

test("a neighbour's photos are never attached; the miss is remembered so we don't pay again", async () => {
  reset(); mode = "neighbor";
  const m = await getListingMedia(user.id, home(4000), { fetch: true });
  assert.equal(m.photoStatus, "unavailable"); assert.equal(m.photos.length, 0);
  assert.deepEqual(calls.map((c) => c.path), ["/v1/properties/by-address"], "no photo call for the wrong home");
  calls.length = 0;
  const again = await getListingMedia(user.id, home(4000), { fetch: true });
  assert.equal(again.photoStatus, "unavailable"); assert.equal(calls.length, 0);
});

test("not found and empty galleries come back 'unavailable' without failing", async () => {
  reset();
  const nf = await getListingMedia(user.id, { address: "9 Nowhere Road", city: "Bethesda", state: "MD", zip: "20814" }, { fetch: true });
  assert.equal(nf.photoStatus, "unavailable");
  reset(); mode = "empty";
  const em = await getListingMedia(user.id, home(6000), { fetch: true });
  assert.equal(em.photoStatus, "unavailable"); assert.equal(em.photoCount, 0);
});

test("provider out of credits: the app keeps working and stops calling for an hour", async () => {
  reset(); mode = "credits";
  const a = await getListingMedia(user.id, home(7000), { fetch: true });
  const b = await getListingMedia(user.id, home(7001), { fetch: true });
  assert.equal(a.photoStatus, "unavailable"); assert.equal(b.photoStatus, "unavailable");
  assert.equal(calls.length, 1, "benched after the first 402");
  const failed = (await store.list("api_usage", user.id)).filter((r: any) => !r.success);
  assert.ok(failed.length >= 1, "failures are logged separately");
});

test("city + state are required for an exact match (no guessing from a bare street)", async () => {
  reset();
  const m = await getListingMedia(user.id, { address: "12 Main Street" }, { fetch: true });
  assert.equal(m.photoStatus, "unavailable"); assert.equal(calls.length, 0);
});

test("plan allowance: a free user runs out, cached homes stay free, a pro user isn't limited", async () => {
  reset();
  process.env.MILA_TIER_LIMITS = JSON.stringify({ free: { photoEnrichments: 2 } });
  const free = await createProfile({ email: "free@example.com", full_name: "Free User" });
  for (const sub of await store.list("subscriptions", free.id)) await store.update("subscriptions", free.id, sub.id, { status: "canceled" });
  if (!(await store.list("subscriptions", free.id)).length) await store.insert("subscriptions", free.id, { plan_key: "pro", status: "canceled", credits_per_period: 0, period_start: new Date().toISOString(), period_end: new Date().toISOString(), stripe_customer_id: null, stripe_subscription_id: null });
  assert.equal((await getListingMedia(free.id, home(8001), { fetch: true })).photoStatus, "ok");
  assert.equal((await getListingMedia(free.id, home(8002), { fetch: true })).photoStatus, "ok");
  const third = await getListingMedia(free.id, home(8003), { fetch: true });
  assert.equal(third.photoStatus, "limited"); assert.equal(third.photos.length, 0);
  calls.length = 0;
  assert.equal((await getListingMedia(free.id, home(8001), { fetch: true })).photoStatus, "ok", "cached homes don't count");
  assert.equal(calls.length, 0);
  assert.equal((await getListingMedia(user.id, home(8003), { fetch: true })).photoStatus, "ok", "dev/pro tier unaffected");
  delete process.env.MILA_TIER_LIMITS;
});

test("shared monthly budget stops all spending", async () => {
  reset(); process.env.PHOTO_MONTHLY_UNIT_BUDGET = "1";
  const m = await getListingMedia(user.id, home(9100), { fetch: true });
  assert.equal(m.photoStatus, "unavailable"); assert.equal(calls.length, 0);
  delete process.env.PHOTO_MONTHLY_UNIT_BUDGET;
});

test("no provider key: listings still work, photos 'unavailable'", async () => {
  reset(); const k = process.env.ZILLAPI_API_KEY; delete process.env.ZILLAPI_API_KEY;
  const m = await getListingMedia(user.id, home(9200), { fetch: true });
  assert.equal(m.photoStatus, "unavailable"); assert.equal(calls.length, 0);
  process.env.ZILLAPI_API_KEY = k;
});
