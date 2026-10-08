// The pricing guard: even if a subscriber maxes out EVERY paid limit, the plan must still make money.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/lib/config.ts";
import { DEFAULT_TIER_LIMITS, PLAN_TIER } from "../src/lib/media/limits.ts";

const DATA_COST = 0.074;       // RentCast, per request (override: MILA_RENTCAST_COST_PER_REQUEST)
const PHOTO_COST = 0.05;       // generous allowance per enriched home
const STRIPE = (price: number) => price * 0.029 + 0.3;

test("worst case (AI budget fully spent + every paid data limit used) stays under 60% of the price", () => {
  for (const plan of DEFAULT_CONFIG.plans.filter((p) => p.key !== "team")) {
    const lim = DEFAULT_TIER_LIMITS[PLAN_TIER[plan.key]];
    const worst = plan.ai_budget_usd + lim.listingSearches * DATA_COST + lim.photoEnrichments * PHOTO_COST + STRIPE(plan.price_usd);
    assert.ok(worst <= plan.price_usd * 0.6, `${plan.name}: worst case $${worst.toFixed(2)} vs price $${plan.price_usd}`);
  }
});

test("top-up credits always cost more per credit than any plan", () => {
  const cheapest = Math.max(...DEFAULT_CONFIG.plans.filter((p) => p.key !== "team").map((p) => p.price_usd / p.credits));
  assert.ok((DEFAULT_CONFIG.credit_price_usd ?? 0) > cheapest);
  for (const k of DEFAULT_CONFIG.packs) assert.ok(k.price_usd / k.credits >= cheapest);
});

test("a research run costs enough credits that daily use can't outrun the plan", () => {
  const run = DEFAULT_CONFIG.credit_costs.market_research;
  for (const plan of DEFAULT_CONFIG.plans.filter((p) => p.key !== "team")) {
    const runsPerMonth = plan.credits / run;
    assert.ok(runsPerMonth <= 60, `${plan.name} allows ${runsPerMonth.toFixed(0)} research runs a month`);
  }
});
