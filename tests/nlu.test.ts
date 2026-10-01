import test from "node:test";
import assert from "node:assert/strict";
import { parseWhen, parseAddress, parseMoney, parseBeds, parseTimeline, parsePersonName, parseLocation, splitClauses, parseTime, parseContactType } from "../src/lib/agent/nlu";
import { partsIn } from "../src/lib/time";

const tz = "America/New_York";
// Thursday Oct 1 2026, 9:00 AM ET
const now = new Date("2026-10-01T13:00:00Z");

test("sunday at 1pm resolves to coming Sunday", () => {
  const w = parseWhen("I have an open house at 123 Main Street Sunday at 1 PM", now, tz);
  const p = partsIn(w.start!, tz);
  assert.deepEqual([p.m, p.d, p.h, p.mi], [10, 4, 13, 0]);
});

test("ranges", () => {
  const t = parseTime("open house 1-3 PM Sunday");
  assert.deepEqual(t?.start, { h: 13, mi: 0 });
  assert.deepEqual(t?.end, { h: 15, mi: 0 });
  assert.deepEqual(parseTime("from 10 to noon")?.end, { h: 12, mi: 0 });
});

test("bare hour is PM for showing hours; AM for 9-11 only with am", () => {
  assert.equal(parseTime("move my showing to three")?.start.h, 15);
  assert.equal(parseTime("at 10am")?.start.h, 10);
});

test("saturday at 2", () => {
  const w = parseWhen("I moved the open house to Saturday at 2", now, tz);
  const p = partsIn(w.start!, tz);
  assert.deepEqual([p.d, p.h], [3, 14]);
});

test("bedrooms are not times", () => {
  assert.equal(parseTime("looking for a 3 bedroom house around $650k"), null);
  assert.equal(parseBeds("looking for a 3 bedroom house"), 3);
});

test("address", () => {
  assert.equal(parseAddress("open house at 123 main st on sunday"), "123 Main Street");
  assert.equal(parseAddress("at 4501 N. Oak Ave Saturday"), "4501 N. Oak Avenue");
});

test("money, timeline, name, location", () => {
  assert.equal(parseMoney("around $650k").max, 650000);
  assert.equal(parseMoney("budget 1.2M").max, 1200000);
  assert.deepEqual(parseMoney("$500-600k"), { min: 500000, max: 600000 });
  assert.equal(parseTimeline("wants to move in the next 3 months"), "Next 3 months");
  assert.equal(parsePersonName("I have a new buyer named Sarah. She's looking"), "Sarah");
  assert.equal(parseLocation("house in Montgomery County and wants"), "Montgomery County");
  assert.equal(parseContactType("new buyer named Sarah"), "buyer");
});

test("clauses", () => {
  const c = splitClauses("remind me Friday to call Sarah and also move my showing to three");
  assert.equal(c.length, 2);
});
