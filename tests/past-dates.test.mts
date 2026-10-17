// Audit P0-12: a day that already happened is never booked; Mila asks instead.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { parseDate } from "../src/lib/agent/nlu.ts";

const NOW = new Date("2026-10-16T15:00:00Z");

test("past day words resolve to past days", () => {
  const ymd = (t: string) => { const d = parseDate(t, NOW, "America/New_York")!; return `${d.y}-${d.m}-${d.d}`; };
  assert.equal(ymd("yesterday"), "2026-10-15");
  assert.equal(ymd("2 days ago"), "2026-10-14");
  assert.equal(ymd("last Friday"), "2026-10-9");
  assert.equal(ymd("Sept 20"), "2026-9-20"); // a few weeks back is this year, not next
  assert.equal(ymd("Sept 20 2027"), "2027-9-20");
});

test("booking yesterday or a past date asks and adds nothing", async () => {
  for (const m of ["Schedule a showing yesterday at 3pm at 456 Oak Lane", "put a call with Dana on Sept 20 at 10am", "showing last Friday at 2pm at 9 Elm Street"]) {
    const a = await newAgent({ now: NOW, tz: "America/New_York", seed: false });
    const r = await a.say(m);
    assert.match(r.milaMessage.content, /already passed|in the past/i, m);
    assert.equal((await store.list("calendar_events", a.id)).length, 0, m);
  }
});
