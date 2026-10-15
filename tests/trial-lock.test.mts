// A finished trial is view-only: every change is refused except buying a plan, signing out, support and deleting the account.
import test from "node:test";
import assert from "node:assert/strict";
import { writeAllowedWhileLocked } from "../src/lib/server/trial-lock";

test("reading is always allowed", () => { assert.ok(writeAllowedWhileLocked("GET", "/api/contacts")); assert.ok(writeAllowedWhileLocked("GET", "/api/calendar")); });
test("changes are refused while locked", () => {
  for (const [m, p] of [["POST", "/api/contacts"], ["PATCH", "/api/tasks/abc"], ["DELETE", "/api/calendar"], ["POST", "/api/calendar"], ["POST", "/api/content"], ["PUT", "/api/business"], ["POST", "/api/documents"], ["POST", "/api/integrations/google/disconnect"]] as const) assert.equal(writeAllowedWhileLocked(m, p), false, `${m} ${p}`);
});
test("buying a plan, signing out, support and deleting the account still work", () => {
  for (const p of ["/api/billing/checkout", "/api/billing/portal", "/api/stripe/webhook", "/api/auth/logout", "/api/support", "/api/support/abc", "/api/errors", "/api/privacy/delete"]) assert.ok(writeAllowedWhileLocked("POST", p), p);
});
