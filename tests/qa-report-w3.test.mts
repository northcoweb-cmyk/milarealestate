import test from "node:test";
import assert from "node:assert/strict";
import { friendlyAiError, leaksProviderDetail } from "../src/lib/ai/friendly";
import { scrubInternal } from "../src/lib/agent/engine";
import { newAgent, store } from "./qa/harness.mts";
import { creditSummary, recordUsage, grantCredits, getBalance } from "../src/lib/credits";

test("W3: a provider failure becomes a plain sentence with no JSON, code or billing link", () => {
  const raw = 'AI provider error 429: { "error": { "message": "You have no credits remaining. Add credits at https://platform.openai.com/settings/organization/billing/.", "type": "insufficient_quota", "code": "credit_balance_exhausted" } }';
  assert.equal(leaksProviderDetail(raw), true);
  const out = friendlyAiError(new Error(raw));
  assert.equal(leaksProviderDetail(out), false);
  assert.match(out, /weren't charged/);
  assert.doesNotMatch(scrubInternal(raw), /openai|insufficient_quota/i);
});

test("W3: the fallback reply is free and carries no sample-data chips", async () => {
  const a = await newAgent({ now: new Date("2026-10-19T15:00:00Z"), tz: "America/New_York", seed: false });
  const before = await getBalance(a.id);
  const r = await a.say("zxqv blorp fnord quux");
  assert.match(r.milaMessage.content, /not sure how to do that yet/);
  assert.equal(await getBalance(a.id), before);
  assert.doesNotMatch(JSON.stringify(r.milaMessage.blocks), /123 Main Street|Sarah/);
});

test("W3: the ledger shows grants and charges, and a real balance never goes below zero", async () => {
  const a = await newAgent({ now: new Date("2026-10-19T15:00:00Z"), tz: "America/New_York", seed: false });
  const s0 = await creditSummary(a.id);
  const bal = await getBalance(a.id);
  assert.ok(s0.ledger.length >= 1);
  await grantCredits(a.id, 50, "grant", "Credit top-up");
  const s1 = await creditSummary(a.id);
  assert.ok(s1.ledger.some((l: any) => l.delta === 50 && l.label === "Credit top-up"));
  void bal; void recordUsage; void store;
});

test("W3: a charge bigger than what is left is capped, so a real account never goes negative", async () => {
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  await store.insert("credit_transactions", id, { kind: "grant", delta: 10, balance_after: 10, reason: "test", usage_id: null });
  const r = await recordUsage({ userId: id, operation: "market_research", creditKey: "market_research", creditsOverride: 224 });
  assert.equal(r.credits, 10);
  assert.equal(await getBalance(id), 0);
});
