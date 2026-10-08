import test from "node:test";
import assert from "node:assert/strict";
import { planQuality } from "../src/lib/ai/budget.ts";

test("Premium, trial and test accounts get the top model; Standard and unsubscribed stay on the standard model", () => {
  assert.equal(planQuality({ plan_key: "pro", status: "active" }), "premium");
  assert.equal(planQuality({ plan_key: "team", status: "active" }), "premium");
  assert.equal(planQuality({ plan_key: "solo", status: "trial" }), "premium");
  assert.equal(planQuality({ plan_key: "pro", status: "dev" }), "premium");
  assert.equal(planQuality({ plan_key: "solo", status: "active" }), "standard");
  assert.equal(planQuality({ plan_key: "pro", status: "canceled" }), "standard");
  assert.equal(planQuality(undefined), "standard");
});
