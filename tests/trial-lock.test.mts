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

import { store } from "./qa/harness.mts";
import { createProfile } from "../src/lib/auth.ts";
import { TrialEnded, ensureCredits, trialLocked } from "../src/lib/credits.ts";

for (const email of ["customer-lock@gmail.com", "northcoweb@yahoo.com"]) {
  test(`an expired trial locks ${email === "northcoweb@yahoo.com" ? "a tester account" : "a customer"} for chat and changes`, async () => {
    const p = await createProfile({ email: `${Date.now()}-${email}`.replace(/^\d+-northcoweb/, "northcoweb").replace(/^\d+-/, ""), full_name: "Lock Test" }).catch(async () => (await store.findProfileByEmail(email))!);
    const sub = (await store.list("subscriptions", p.id))[0];
    await store.update("subscriptions", p.id, sub.id, { plan_key: "trial", status: "trial", period_start: new Date(Date.now() - 9 * 86_400_000).toISOString(), period_end: new Date(Date.now() - 2 * 86_400_000).toISOString() } as never);
    assert.equal(await trialLocked(p.id), true);
    await assert.rejects(() => ensureCredits(p.id, 1), TrialEnded);
  });
}

import { subLocked } from "../src/lib/credits.ts";
test("a finished trial or an ended subscription is locked; active, past-due grace and a running trial are not", () => {
  const past = new Date(Date.now() - 86400000).toISOString(), future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(subLocked({ status: "trial", period_end: past }), true);
  assert.equal(subLocked({ status: "canceled", period_end: future }), true);
  assert.equal(subLocked({ status: "trial", period_end: future }), false);
  assert.equal(subLocked({ status: "active", period_end: past }), false);
  assert.equal(subLocked({ status: "past_due", period_end: past }), false);
  assert.equal(subLocked(undefined), false);
});
