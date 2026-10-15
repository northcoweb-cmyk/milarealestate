// Apple / any calendar app: the .ics must carry the right instant, place, notes and a reminder, and the private feed link must be tamper-proof.
import test from "node:test";
import assert from "node:assert/strict";
import { buildIcs, feedToken, feedUser, fold } from "../src/lib/integrations/ics-export";
import type { CalendarEvent } from "../src/lib/types";

const ev = { id: "e1", title: "Showing: 12 Oak St, Café", kind: "showing", start_at: "2026-10-21T18:30:00.000Z", end_at: "2026-10-21T19:30:00.000Z", location: "12 Oak St, Austin, TX", status: "confirmed", notes: null, created_at: "2026-10-15T00:00:00.000Z", updated_at: "2026-10-15T01:00:00.000Z" } as unknown as CalendarEvent;

test("one event becomes a valid calendar file with exact UTC time, location, notes and a 30-minute reminder", () => {
  const ics = buildIcs([{ ev, description: "Showing with Sam Lee (buyer)\nPhone: 555-0100\n\nAdded by Mila" }]);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261021T183000Z/);
  assert.match(ics, /DTEND:20261021T193000Z/);
  assert.match(ics, /SUMMARY:Showing: 12 Oak St\\, Café/);
  assert.match(ics, /LOCATION:12 Oak St\\, Austin\\, TX/);
  assert.match(ics.replace(/\r\n /g, ""), /DESCRIPTION:Showing with Sam Lee \(buyer\)\\nPhone: 555-0100\\n\\nAdded by Mila/);
  assert.match(ics, /TRIGGER:-PT30M/);
  assert.match(ics, /UID:e1@milarealestate\.app/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("a cancelled event is marked cancelled and carries no reminder", () => {
  const ics = buildIcs([{ ev: { ...ev, status: "cancelled" }, description: "" }]);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.doesNotMatch(ics, /VALARM/);
});

test("long lines fold at 75 bytes without splitting a character", () => {
  const out = fold("DESCRIPTION:" + "é".repeat(80));
  for (const l of out.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, `line is ${Buffer.byteLength(l)} bytes`);
  assert.equal(out.replace(/\r\n /g, ""), "DESCRIPTION:" + "é".repeat(80));
});

test("the subscription link opens only for the person it was made for", () => {
  const t = feedToken("user-123")!;
  assert.equal(feedUser(t), "user-123");
  assert.equal(feedUser(t + ".ics"), "user-123");
  assert.equal(feedUser(t.replace("user-123", "user-124")), null);
  assert.equal(feedUser("user-123.deadbeef"), null);
  assert.equal(feedUser("garbage"), null);
});
