// CLI: node --import tsx tests/eval/run.mts [filter|--held-out|--tuned] [--verbose] [--json out.json]
import fs from "node:fs";
import { DIMS } from "./lib.mts";
import { runEval } from "./runner.mts";
import { SCENARIOS } from "./scenarios.mts";

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const jsonAt = args.indexOf("--json") >= 0 ? args[args.indexOf("--json") + 1] : null;
const filter = args.find((a) => !a.startsWith("--") && a !== jsonAt);
const sum = await runEval(SCENARIOS, { filter, heldOutOnly: flag("--held-out"), tunedOnly: flag("--tuned") });
const rate = (x: { passed: number; total: number }) => (x.total ? `${x.passed}/${x.total} (${((100 * x.passed) / x.total).toFixed(1)}%)` : "n/a");

console.log(`\nMila eval (deterministic, mocked: rule-based agent, mocked clock, local store; NOT a live-model run)`);
console.log(`scenarios: ${sum.results.length}  implemented: ${sum.implemented}  passed: ${sum.passed}  failed: ${sum.failed}  not_implemented: ${sum.notImplemented.length}`);
console.log(`tuned    : ${rate(sum.tuned)}`);
console.log(`held-out : ${rate(sum.heldOut)}`);
console.log(`\nper-dimension (checks passed / checks run)`);
for (const d of DIMS) {
  const x = sum.dims[d.key];
  if (d.key === "ui") console.log(`  ${d.label.padEnd(44)} not measurable here (no browser; see Playwright/Felix)`);
  else console.log(`  ${d.label.padEnd(44)} ${x.total ? `${x.pass}/${x.total} (${((100 * x.pass) / x.total).toFixed(1)}%)` : "no checks"}`);
}
console.log(`  ${"latency (wall time per turn, local store)".padEnd(44)} p50 ${sum.latency.p50}ms  p95 ${sum.latency.p95}ms  max ${sum.latency.max}ms over ${sum.latency.turns} turns`);
console.log(`  ${"cost".padEnd(44)} rule-based: $0 model spend, 0 AI calls; ${sum.credits.total} credits metered over ${sum.credits.turns} turns (${sum.credits.perTurn.toFixed(2)}/turn)`);
console.log(`\nby category`);
for (const [k, v] of Object.entries(sum.byCategory).sort()) console.log(`  ${k.padEnd(28)} ${v.passed}/${v.total}`);
if (sum.notImplemented.length) { console.log(`\nnot_implemented (listed, not failing)`); for (const r of sum.notImplemented) console.log(`  ${r.id.padEnd(10)} ${r.reason}`); }
const bad = sum.results.filter((r) => r.status === "fail");
if (bad.length) {
  console.log(`\nFAILURES`);
  for (const r of bad) {
    console.log(`  ${r.id}${r.heldOut ? " [held-out]" : ""} (${r.category}) ${r.title}`);
    for (const f of r.failures.slice(0, 6)) console.log(`      - ${f.slice(0, 260)}`);
    if (flag("--verbose")) console.log(r.log.map((l) => "        " + l.slice(0, 220)).join("\n"));
  }
}
if (jsonAt) fs.writeFileSync(jsonAt, JSON.stringify(sum, null, 1));
process.exit(0);
