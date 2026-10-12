import test from "node:test";
import assert from "node:assert/strict";
import { tierOf } from "../src/components/plan-badge.tsx";

test("each plan state gets its own tier (and so its own color)", () => {
  assert.equal(tierOf({ status: "trial", trial: { expired: false } }), "trial");
  assert.equal(tierOf({ status: "trial", trial: { expired: true } }), "trial_ended");
  assert.equal(tierOf({ status: "active", planKey: "pro" }), "monthly");
  assert.equal(tierOf({ status: "active", planKey: "pro_annual" }), "annual");
  assert.equal(tierOf({ status: "active", planKey: "team" }), "team");
  assert.equal(tierOf({ status: "past_due", planKey: "pro" }), "past_due");
  assert.equal(tierOf({ status: "canceled", planKey: "pro" }), "canceled");
  assert.equal(tierOf({ status: "active", planKey: "pro" }, true), "tester");
});
