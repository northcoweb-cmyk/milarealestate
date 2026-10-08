import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCalendarLink, parseIcs } from "../src/lib/integrations/ics.ts";

const ICS = `BEGIN:VCALENDAR\r
BEGIN:VEVENT\r
UID:a1\r
DTSTART;TZID=America/New_York:20261009T140000\r
DTEND;TZID=America/New_York:20261009T150000\r
SUMMARY:Showing\\, 12 Oak\r
LOCATION:12 Oak Lane\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:w1\r
DTSTART:20261012T130000Z\r
DTEND:20261012T140000Z\r
RRULE:FREQ=WEEKLY;COUNT=3\r
SUMMARY:Team meeting\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:ad\r
DTSTART;VALUE=DATE:20261010\r
SUMMARY:Holiday\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:old\r
DTSTART:20250101T130000Z\r
DTEND:20250101T140000Z\r
SUMMARY:Last year\r
END:VEVENT\r
END:VCALENDAR`;

test("calendar link: timed events with timezones, repeats and escapes; all-day and out-of-window events are skipped", () => {
  const ev = parseIcs(ICS, { from: new Date("2026-10-08T00:00:00Z"), to: new Date("2026-12-08T00:00:00Z"), tz: "America/New_York" });
  assert.deepEqual(ev.map((e) => e.summary), ["Showing, 12 Oak", "Team meeting", "Team meeting", "Team meeting"]);
  assert.equal(ev[0].start.toISOString(), "2026-10-09T18:00:00.000Z"); // 2 PM Eastern
  assert.equal(ev[0].location, "12 Oak Lane");
  assert.equal(ev[1].start.toISOString(), "2026-10-12T13:00:00.000Z");
  assert.equal(ev[3].start.toISOString(), "2026-10-26T13:00:00.000Z");
  assert.equal(new Set(ev.map((e) => e.uid)).size, 4, "every repeat has its own id so re-syncing never duplicates");
});

test("webcal links become https, and anything else is refused", () => {
  assert.equal(normalizeCalendarLink("webcal://p12-caldav.icloud.com/published/2/abc"), "https://p12-caldav.icloud.com/published/2/abc");
  assert.equal(normalizeCalendarLink("javascript:alert(1)"), null);
  assert.equal(normalizeCalendarLink("not a link"), null);
});
