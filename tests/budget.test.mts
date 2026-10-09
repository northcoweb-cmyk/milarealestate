// AI spend protection + the 7-day trial. Nothing here calls a real model.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-budget-"));
process.env.MILA_DATA_DIR = dir;
delete process.env.ANTHROPIC_API_KEY; process.env.OPENAI_API_KEY = "sk-test"; process.env.AI_PROVIDER = "openai";
process.env.MILA_TRIALS = "1";

const { createTestStore } = await import("../src/lib/db/store.ts");
const store: any = createTestStore(dir);
const { createProfile } = await import("../src/lib/users.ts");
const credits = await import("../src/lib/credits.ts");
const budget = await import("../src/lib/ai/budget.ts");
const { getProvider } = await import("../src/lib/ai/provider.ts");
const { DEFAULT_CONFIG } = await import("../src/lib/config.ts");

const seen: any[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  if (!String(url).includes("openai.com")) return realFetch(url, init);
  seen.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 100, completion_tokens: 50 }, output_text: "hi", output: [{ type: "message", content: [{ type: "output_text", text: "hi" }] }] }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const user = async (email: string) => { const p = await createProfile({ email, full_name: "Test Agent" }); return p; };
const spend = (userId: string, usd: number) => store.insert("usage", userId, { conversation_id: null, operation: "turn:test", tier: "x", provider: "openai", model: "m", input_units: 0, output_units: 0, est_cost_usd: usd, credits: 0 });
const ask = (tier: any = "fast", extra: object = {}) => getProvider().complete({ tier, system: "s", messages: [{ role: "user", content: "hello" }], ...extra });

test("new signups start a 7-day trial with a small credit grant and no card", async () => {
  const p = await user("trial@test.dev");
  const s = await credits.ensureSubscription(p.id);
  assert.equal(s.status, "trial");
  assert.equal(Math.round((new Date(s.period_end).getTime() - new Date(s.period_start).getTime()) / 86_400_000), 7);
  assert.equal(await credits.getBalance(p.id), DEFAULT_CONFIG.trial!.credits);
  const sum = await credits.creditSummary(p.id);
  assert.ok(sum.trial && sum.trial.daysLeft === 7 && sum.trial.day === 1 && !sum.trial.expired);
});

test("when the trial ends nothing paid runs, with a clear reason", async () => {
  const p = await user("ended@test.dev");
  const s = await credits.ensureSubscription(p.id);
  await credits.ensureCredits(p.id, 1); // fine during the trial
  await store.update("subscriptions", p.id, s.id, { period_end: new Date(Date.now() - 1000).toISOString() });
  await assert.rejects(() => credits.ensureCredits(p.id, 1), (e: any) => e instanceof credits.TrialEnded && /trial has ended/i.test(e.message));
  await store.update("subscriptions", p.id, s.id, { status: "active", plan_key: "solo", period_end: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  await credits.ensureCredits(p.id, 1); // paying again unlocks it
});

test("plans: Standard $29 / Premium $49 / Team $299, each with a hard AI ceiling well under the price", () => {
  assert.deepEqual(DEFAULT_CONFIG.plans.map((p) => [p.key, p.price_usd]), [["solo", 29], ["pro", 49], ["team", 299]]);
  for (const p of DEFAULT_CONFIG.plans) assert.ok(p.ai_budget_usd! > 0 && p.ai_budget_usd! <= p.price_usd * 0.3, `${p.key} AI ceiling is at most 30% of the price`);
  assert.ok(DEFAULT_CONFIG.trial!.ai_budget_usd <= 3);
});

test("a trial user is cut off at the trial AI ceiling, but not before", async () => {
  budget.resetAiBudgetMemo();
  const p = await user("cap@test.dev");
  await credits.ensureSubscription(p.id);
  await budget.runInAiScope(p.id, async () => {
    seen.length = 0;
    await ask(); // fine
    assert.equal(seen.length, 1);
  });
  await spend(p.id, 2.95); budget.resetAiBudgetMemo();
  await budget.runInAiScope(p.id, async () => {
    // $2.95 of $3 spent, but the daily cap ($1) is the tighter one for a trial
    await assert.rejects(() => ask(), (e: any) => e instanceof budget.AiBudgetError);
    assert.ok(budget.aiLimitedReason());
  });
  assert.equal(seen.length, 1, "the refused call never reached the model");
});

test("a paid plan gets its own ceiling; one bad day can't burn the month", async () => {
  budget.resetAiBudgetMemo();
  const p = await user("solo@test.dev");
  const s = await credits.ensureSubscription(p.id);
  await store.update("subscriptions", p.id, s.id, { status: "active", plan_key: "solo", period_end: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  await spend(p.id, 2.5); budget.resetAiBudgetMemo(); // daily cap for Solo = 18/8 = $2.25
  await budget.runInAiScope(p.id, async () => { await assert.rejects(() => ask(), (e: any) => e.code === "user_day"); });
});

test("spend inside one request counts immediately (a loop can't sneak past the meter)", async () => {
  budget.resetAiBudgetMemo();
  const p = await user("loop@test.dev");
  const s = await credits.ensureSubscription(p.id);
  await store.update("subscriptions", p.id, s.id, { status: "active", plan_key: "pro", period_end: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  await budget.runInAiScope(p.id, async () => {
    await ask(); budget.noteAiSpend(100); // pretend a very expensive call just finished
    await assert.rejects(() => ask(), (e: any) => e instanceof budget.AiBudgetError);
  });
});

test("deep-reasoning and web-research calls need real headroom, not just 'not yet over'", async () => {
  budget.resetAiBudgetMemo();
  const p = await user("deep@test.dev");
  await credits.ensureSubscription(p.id);
  await spend(p.id, 0.4); budget.resetAiBudgetMemo(); // trial cap is $0.50: $0.40 spent leaves $0.10, under the $0.25 a deep call needs
  await budget.runInAiScope(p.id, async () => {
    await ask("fast"); // cheap path still fine
    await assert.rejects(() => ask("research", { webSearch: true }), (e: any) => e instanceof budget.AiBudgetError);
  });
});

test("global kill switch and global daily cap stop every call", async () => {
  budget.resetAiBudgetMemo();
  const p = await user("global@test.dev");
  await credits.ensureSubscription(p.id);
  process.env.MILA_AI_DISABLED = "1";
  await budget.runInAiScope(p.id, async () => { await assert.rejects(() => ask(), (e: any) => e.code === "disabled"); });
  delete process.env.MILA_AI_DISABLED;
  process.env.MILA_DAILY_AI_BUDGET_USD = "0.01"; budget.resetAiBudgetMemo();
  await spend(p.id, 0.02); budget.resetAiBudgetMemo();
  await budget.runInAiScope(p.id, async () => { await assert.rejects(() => ask(), (e: any) => e.code === "global_day"); });
  delete process.env.MILA_DAILY_AI_BUDGET_USD;
});

test("oversized requests are trimmed before they reach the model", async () => {
  budget.resetAiBudgetMemo();
  const p = await user("big@test.dev");
  const s = await credits.ensureSubscription(p.id);
  await store.update("subscriptions", p.id, s.id, { status: "active", plan_key: "team", period_end: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  seen.length = 0;
  await budget.runInAiScope(p.id, async () => { await ask("fast", { maxTokens: 50_000, messages: [{ role: "user", content: "x".repeat(400_000) }] }); });
  const body = seen[0];
  const sent = JSON.stringify(body);
  assert.ok(sent.length < 250_000, `input trimmed (${sent.length})`);
  const outCap = body.max_completion_tokens ?? body.max_output_tokens ?? body.max_tokens;
  assert.ok(outCap <= budget.MAX_OUTPUT_TOKENS(), `output capped (${outCap})`);
});
