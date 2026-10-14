// The pricing guard: even if a subscriber maxes out EVERY paid limit, the plan must still make money.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/lib/config";
import { AI_USD_PER_CREDIT, takeTurnAiCost } from "../src/lib/credits";
import { trackApi } from "../src/lib/media/usage";

const STRIPE = (price: number) => price * 0.029 + 0.3;

test("worst case (every plan credit spent at the metered rate of $0.01 of cost per credit) stays under 60% of the price", () => {
  // data pulls (listing data, photos) are added to each turn's cost and billed in credits, so there are no per-plan pull caps
  for (const plan of DEFAULT_CONFIG.plans.filter((p) => p.key !== "team" && p.key !== "solo")) {
    const monthlyPrice = plan.price_usd / (plan.interval === "year" ? 12 : 1);
    const worst = plan.credits * AI_USD_PER_CREDIT + STRIPE(plan.price_usd) / (plan.interval === "year" ? 12 : 1);
    assert.ok(worst <= monthlyPrice * 0.6, `${plan.name}: worst case $${worst.toFixed(2)} vs monthly price $${monthlyPrice.toFixed(2)}`);
  }
});

test("a paid data pull adds its cost to the turn so the agent pays for it in credits", async () => {
  takeTurnAiCost("econ-u1");
  await trackApi({ userId: "econ-u1", provider: "rentcast", endpoint: "listings", success: true, estCostUsd: 0.074, units: 1 });
  const got = takeTurnAiCost("econ-u1");
  assert.ok(Math.abs(got - 0.074) < 1e-9, `got ${got}`);
});

test("top-up credits always cost more per credit than any plan", () => {
  const cheapest = Math.max(...DEFAULT_CONFIG.plans.filter((p) => p.key !== "team").map((p) => p.price_usd / (p.interval === "year" ? 12 : 1) / p.credits));
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
