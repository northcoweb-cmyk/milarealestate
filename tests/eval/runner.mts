import { DIMS, runScenario, type Dim, type EvalScenario, type ScenarioResult } from "./lib.mts";

export interface DimScore { pass: number; total: number }
export interface EvalSummary {
  results: ScenarioResult[];
  implemented: number; passed: number; failed: number; notImplemented: ScenarioResult[];
  tuned: { total: number; passed: number }; heldOut: { total: number; passed: number };
  dims: Record<Dim, DimScore>;
  latency: { p50: number; p95: number; max: number; turns: number };
  credits: { total: number; perTurn: number; turns: number };
  byCategory: Record<string, { total: number; passed: number }>;
}

const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };

export async function runEval(scenarios: EvalScenario[], opts: { filter?: string; heldOutOnly?: boolean; tunedOnly?: boolean } = {}): Promise<EvalSummary> {
  const sel = scenarios.filter((s) => (!opts.filter || s.id.includes(opts.filter) || s.category === opts.filter) && (!opts.heldOutOnly || s.heldOut) && (!opts.tunedOnly || !s.heldOut));
  const results: ScenarioResult[] = [];
  for (const sc of sel) results.push(await runScenario(sc));
  const impl = results.filter((r) => r.status !== "not_implemented");
  const dims = Object.fromEntries(DIMS.map((d) => [d.key, { pass: 0, total: 0 }])) as Record<Dim, DimScore>;
  for (const r of impl) for (const c of r.checks) { dims[c.dim].total++; if (c.ok) dims[c.dim].pass++; }
  const ms = impl.flatMap((r) => r.turnMs);
  const byCategory: EvalSummary["byCategory"] = {};
  for (const r of impl) { const c = (byCategory[r.category] ??= { total: 0, passed: 0 }); c.total++; if (r.status === "pass") c.passed++; }
  const credits = impl.reduce((n, r) => n + r.creditsSpent, 0);
  return {
    results, implemented: impl.length, passed: impl.filter((r) => r.status === "pass").length, failed: impl.filter((r) => r.status === "fail").length,
    notImplemented: results.filter((r) => r.status === "not_implemented"),
    tuned: { total: impl.filter((r) => !r.heldOut).length, passed: impl.filter((r) => !r.heldOut && r.status === "pass").length },
    heldOut: { total: impl.filter((r) => r.heldOut).length, passed: impl.filter((r) => r.heldOut && r.status === "pass").length },
    dims, latency: { p50: pct(ms, 0.5), p95: pct(ms, 0.95), max: Math.max(0, ...ms), turns: ms.length },
    credits: { total: credits, perTurn: ms.length ? credits / ms.length : 0, turns: ms.length }, byCategory,
  };
}
