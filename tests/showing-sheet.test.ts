import test from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, allItems, emptySheet, mergeSheet, progress, summarize } from "../src/lib/showing-sheet";

const base = () => emptySheet("prop-1", new Date("2026-10-02T15:00:00Z"));

test("checklist is thorough and every item id is unique", () => {
  const ids = allItems().map((i) => i.id);
  assert.ok(ids.length >= 60, `only ${ids.length} items`);
  assert.equal(new Set(ids).size, ids.length);
  for (const key of ["exterior", "systems", "kitchen", "baths", "basement", "confirm"]) assert.ok(SECTIONS.some((s) => s.key === key), key);
});

test("merge keeps valid updates and drops unknown ids, bad states and bad media ids", () => {
  const s = mergeSheet(base(), { items: { "ext-roof": { state: "issue", note: "Curling shingles on the south side" }, "nope": { state: "ok" }, "k-sink": { state: "weird" as never, media: ["abcdefgh-1234", "../etc"] } } });
  assert.equal(s.items["ext-roof"].state, "issue");
  assert.equal(s.items["nope"], undefined);
  assert.equal(s.items["k-sink"].state, "todo");
  assert.deepEqual(s.items["k-sink"].media, ["abcdefgh-1234"]);
});

test("custom items must use x- ids and a real section", () => {
  const s = mergeSheet(base(), { custom: [{ id: "x-pool", section: "lot", label: "Pool pump runs" }, { id: "evil", section: "lot", label: "bad id" }, { id: "x-empty", section: "lot", label: "  " }] });
  assert.deepEqual(s.custom.map((c) => c.id), ["x-pool"]);
  const s2 = mergeSheet(s, { items: { "x-pool": { state: "ok" } } });
  assert.equal(progress(s2).total, allItems().length + 1);
  assert.equal(progress(s2).ok, 1);
});

test("progress counts checked, flagged and media", () => {
  let s = mergeSheet(base(), { items: { "ext-roof": { state: "issue", media: ["aaaaaaaa-1111"] }, "ext-siding": { state: "ok" }, "ext-gutters": { state: "na" } }, media: ["bbbbbbbb-2222"] });
  const p = progress(s);
  assert.equal(p.done, 3); assert.equal(p.issues, 1); assert.equal(p.mediaCount, 2);
  s = mergeSheet(s, { items: { "ext-siding": { state: "todo" } } });
  assert.equal(progress(s).done, 2);
});

test("summary lists flagged items with notes, then notes, then what's left", () => {
  const s = mergeSheet(base(), { items: { "sys-hvac": { state: "issue", note: "Furnace is 22 years old" }, "k-appliances": { state: "ok", note: "Fridge stays" } }, overall_note: "Loved the light." });
  const t = summarize(s, "123 Main Street", "Fri, Oct 2 · 3:00 PM");
  assert.match(t, /Showing sheet — 123 Main Street/);
  assert.match(t, /NEEDS ATTENTION\n• Heating & cooling — Furnace is 22 years old/);
  assert.match(t, /NOTES\n• Appliances work & which stay — Fridge stays/);
  assert.match(t, /NOT CHECKED \(\d+\)/);
  assert.match(t, /OVERALL\nLoved the light\./);
});
