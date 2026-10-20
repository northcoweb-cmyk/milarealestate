import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { testerTopupOn, ensureCredits, getBalance, creditSummary } from "../src/lib/credits.ts";

const now = new Date("2026-10-19T19:00:00Z");

test("W12: a tester is topped up with a visible 'Test account top-up' entry, and the switch turns it off", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await store.update("profiles", a.id, a.id, { email: "sarahpark0506@gmail.com" } as never);
  const cfg = await store.getConfig();
  await store.setConfig({ ...cfg, tester_topup: true });
  assert.equal(await testerTopupOn(a.id), true);
  const bal = await getBalance(a.id);
  await store.insert("credit_transactions", a.id, { kind: "adjust", delta: -bal, balance_after: 0, reason: "test: run down", usage_id: null } as never);
  await ensureCredits(a.id, 5);
  const s = await creditSummary(a.id);
  assert.ok(s.ledger.some((l: any) => l.label === "Test account top-up" && l.delta === 3000), "the grant is labelled in the history");
  await store.setConfig({ ...cfg, tester_topup: false });
  assert.equal(await testerTopupOn(a.id), false);
  await store.setConfig(cfg);
});
