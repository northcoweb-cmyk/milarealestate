import test from "node:test";
import assert from "node:assert/strict";
import { buildCard, sortCards, STAGES } from "../src/lib/property-stage.ts";

const now = new Date("2026-10-05T14:00:00Z");
const base = { user_id: "u", created_at: "2026-09-01T00:00:00Z", updated_at: "", address: "1 A St", city: "Bethesda", state: "MD", zip: "20814", county: null, list_price: 650000, beds: 3, baths: 2, sqft: 1800, listing_url: null, description: null, verified: false, is_demo: false };
const prop = (id: string, over: object = {}) => ({ ...base, id, address: `${id} Main Street`, ...over }) as any;
const mem = (pid: string, key: string, value: string) => ({ id: key + pid, user_id: "u", created_at: "", updated_at: "", scope: "property", subject_id: pid, key, value, source: "user_stated", confidence: 1, pinned: false }) as any;
const ev = (pid: string, kind: string, startIso: string, over: object = {}) => ({ id: kind + startIso, user_id: "u", created_at: "", updated_at: "", title: `${kind} — ${pid}`, kind, start_at: startIso, end_at: new Date(new Date(startIso).getTime() + 3_600_000).toISOString(), location: null, property_id: pid, contact_id: null, status: "confirmed", source: "mila", external_id: null, synced_at: null, workflow_run_id: null, notes: null, ...over }) as any;

test("a freshly saved home is Upcoming; an open house on the calendar makes it Live", () => {
  assert.equal(buildCard(prop("p1"), [], [], [], now).stage, "upcoming");
  const live = buildCard(prop("p1"), [], [ev("p1", "open_house", "2026-10-11T17:00:00Z")], [], now);
  assert.deepEqual([live.stage, live.group, live.next?.kind], ["active", "current", "open_house"]);
});

test("under contract and sold come from what Mila recorded, with the real numbers", () => {
  const uc = buildCard(prop("p2"), [mem("p2", "Transaction", "Under contract · closing Friday")], [ev("p2", "closing", "2026-11-20T15:00:00Z", { notes: "Transaction milestone" })], [], now);
  assert.deepEqual([uc.stage, uc.group, uc.closing_at], ["under_contract", "current", "2026-11-20T15:00:00Z"]);
  const sold = buildCard(prop("p3"), [mem("p3", "Transaction", "Sold $612,000 · closed Monday, Oct 5")], [], [], now);
  assert.deepEqual([sold.stage, sold.group, sold.sold_price], ["sold", "past", 612000]);
});

test("the agent's own stage choice always wins, and 'auto' (no memory) goes back to Mila's read", () => {
  const m = buildCard(prop("p4"), [mem("p4", "Transaction", "Under contract · x"), mem("p4", "Stage", "archived")], [], [], now);
  assert.deepEqual([m.stage, m.manual_stage, m.group], ["archived", true, "past"]);
  assert.equal(buildCard(prop("p4"), [mem("p4", "Transaction", "Under contract · x")], [], [], now).stage, "under_contract");
  assert.equal(buildCard(prop("p5"), [mem("p5", "Stage", "nonsense")], [], [], now).stage, "upcoming", "an invalid stored value is ignored");
});

test("photo: an uploaded photo beats street view; no city/state means no street view; other homes' data never leaks in", () => {
  const withPhoto = buildCard(prop("p6"), [], [], [{ id: "i", url: "/api/files/abc", position: 0, property_id: "p6" } as any], now);
  assert.deepEqual([withPhoto.image, withPhoto.image_source], ["/api/files/abc", "photo"]);
  assert.equal(buildCard(prop("p6"), [], [], [], now).image_source, "street");
  assert.equal(buildCard(prop("p7", { city: null, state: null }), [], [], [], now).image, null);
  const other = buildCard(prop("p8"), [mem("p9", "Transaction", "Sold $1 · x")], [ev("p9", "open_house", "2026-10-11T17:00:00Z")], [], now);
  assert.deepEqual([other.stage, other.next], ["upcoming", null]);
});

test("ordering: closing soonest first, then live, then prepping, then sold", () => {
  const cards = [buildCard(prop("a"), [mem("a", "Transaction", "Sold $1 · x")], [], [], now), buildCard(prop("b"), [], [], [], now), buildCard(prop("c"), [], [ev("c", "open_house", "2026-10-11T17:00:00Z")], [], now), buildCard(prop("d"), [mem("d", "Transaction", "Under contract · x")], [], [], now)];
  assert.deepEqual(sortCards(cards).map((c) => c.id), ["d", "c", "b", "a"]);
  assert.equal(STAGES.length, 5);
});

test("on-market vs off-market: only a live listing is 'on'; prepping, under contract, sold and archived are 'off'", () => {
  assert.equal(buildCard(prop("m1"), [], [ev("m1", "open_house", "2026-10-11T17:00:00Z")], [], now).market, "on");
  assert.equal(buildCard(prop("m2"), [], [], [], now).market, "off");
  assert.equal(buildCard(prop("m3"), [mem("m3", "Transaction", "Under contract · x")], [], [], now).market, "off");
  assert.equal(buildCard(prop("m4"), [mem("m4", "Transaction", "Sold $600,000 · closed Monday")], [], [], now).market, "off");
});
