import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/lib/config";
import { PLAN_TIER } from "../src/lib/media/limits";
import { visiblePlans } from "../src/lib/plans";

test("annual plan: $490/yr, 2 months free, same monthly credits, pro limits, bonus perk, shown to new users", () => {
  const p = DEFAULT_CONFIG.plans.find((x) => x.key === "pro_annual")!;
  const monthly = DEFAULT_CONFIG.plans.find((x) => x.key === "pro")!;
  assert.equal(p.interval, "year");
  assert.equal(p.price_usd, monthly.price_usd * 10);
  assert.equal(p.credits, monthly.credits);
  assert.ok(p.ai_budget_usd! <= monthly.ai_budget_usd!, "annual AI ceiling is no higher than monthly");
  assert.ok(p.ai_budget_usd! <= (p.price_usd / 12) * 0.3, "AI ceiling is at most 30% of the monthly-equivalent price");
  assert.ok((p.bonus_credits ?? 0) > 0);
  assert.equal(PLAN_TIER["pro_annual"], "pro");
  assert.ok(visiblePlans(DEFAULT_CONFIG, null).some((x) => x.key === "pro_annual"));
  assert.ok(!visiblePlans(DEFAULT_CONFIG, null).some((x) => x.key === "solo"));
});

test("a saved config that predates the annual plan still gets it", async () => {
  const { createTestStore } = await import("../src/lib/db/store");
  const os = await import("node:os"), fs = await import("node:fs"), path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-cfg-"));
  const store: any = createTestStore(dir, true);
  const old = { ...DEFAULT_CONFIG, plans: DEFAULT_CONFIG.plans.filter((x) => x.key !== "pro_annual") };
  await store.setConfig(old);
  const cfg = await store.getConfig();
  assert.ok(cfg.plans.some((x: any) => x.key === "pro_annual"));
});
