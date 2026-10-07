import test from "node:test";
import assert from "node:assert/strict";
import { dailySummaryEmail, summaryHasContent } from "../src/lib/daily-summary.ts";

const base = { name: "Sarah Carter", tz: "America/New_York", appUrl: "https://app.milarealestate.app" };

test("daily summary: nothing to say means no email", () => {
  assert.equal(summaryHasContent({ ...base, events: [], tasks: [], approvals: [] }), false);
});

test("daily summary: lists the day, leads with approvals, links to the app, escapes text", () => {
  const i = { ...base, events: [{ title: "Showing <b>at</b> 12 Oak", start_at: "2026-10-08T14:00:00Z" }], tasks: [{ title: "Send CMA", due_at: "2026-10-08T20:00:00Z" }], approvals: [{ title: "Email to Dana" }] };
  assert.equal(summaryHasContent(i), true);
  const m = dailySummaryEmail(i);
  assert.match(m.subject, /1 thing needs your OK/);
  assert.match(m.html, /https:\/\/app\.milarealestate\.app/);
  assert.doesNotMatch(m.html, /<b>at<\/b>/);
  assert.match(m.text, /10:00 AM Showing/);
  assert.match(m.text, /Settings > Notifications/);
});
