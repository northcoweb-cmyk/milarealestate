// Realistic multi-turn evaluation, run under the normal suite. Deterministic and mocked (rule-based agent, mocked clock, local store): it is NOT a live-model run.
// Only IMPLEMENTED scenarios can fail this test; not_implemented ones are listed in the output and by `node --import tsx tests/eval/run.mts`.
import test from "node:test";
import assert from "node:assert/strict";
import { runEval } from "./eval/runner.mts";
import { SCENARIOS } from "./eval/scenarios.mts";

test("eval: scenario inventory is complete (>=100, >=30% held out, golden-1..25 present in order)", () => {
  assert.ok(SCENARIOS.length >= 100, `only ${SCENARIOS.length} scenarios`);
  assert.ok(SCENARIOS.filter((s) => s.heldOut).length / SCENARIOS.length >= 0.3, "at least 30% held out");
  const golden = SCENARIOS.filter((s) => /^golden-\d+$/.test(s.id)).map((s) => s.id);
  assert.deepEqual(golden, Array.from({ length: 25 }, (_, i) => `golden-${i + 1}`));
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length, "ids are unique");
});

test("eval: every implemented scenario passes (not_implemented are listed, not failing)", { timeout: 300_000 }, async () => {
  const sum = await runEval(SCENARIOS);
  for (const r of sum.notImplemented) console.log(`  not_implemented ${r.id}: ${r.reason}`);
  const bad = sum.results.filter((r) => r.status === "fail");
  assert.deepEqual(bad.map((r) => `${r.id}: ${r.failures.slice(0, 3).join(" ; ")}`), [], `${bad.length} implemented scenario(s) failed`);
  console.log(`  eval: ${sum.passed}/${sum.implemented} implemented passed; tuned ${sum.tuned.passed}/${sum.tuned.total}, held-out ${sum.heldOut.passed}/${sum.heldOut.total}; ${sum.notImplemented.length} not_implemented`);
});
