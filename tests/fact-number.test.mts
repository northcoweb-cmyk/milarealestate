// Audit P0-15: property numbers are validated field by field; nothing becomes 0 or is silently dropped.
import test from "node:test";
import assert from "node:assert/strict";
import { FACT_RULES, parseFact } from "../src/lib/fact-number.ts";

test("valid values parse, junk and out-of-range values explain themselves", () => {
  assert.deepEqual(parseFact("$1,250,000", FACT_RULES.list_price), { value: 1250000 });
  assert.deepEqual(parseFact("", FACT_RULES.beds), { value: null });
  assert.deepEqual(parseFact("2.5", FACT_RULES.baths), { value: 2.5 });
  for (const [v, rule] of [["abc$!", FACT_RULES.list_price], ["999", FACT_RULES.beds], ["two", FACT_RULES.baths], ["-100", FACT_RULES.sqft], ["2.3", FACT_RULES.baths], ["3.5", FACT_RULES.beds]] as const) {
    const r = parseFact(v, rule as never);
    assert.ok("error" in r, `${v} should be rejected`);
  }
});
