import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_CONFIG } from "../config";
import { getStore } from "../db/store";
import type { AppConfig, PlanConfig } from "../types";

/**
 * AI spend protection. Credits are what the customer sees; this is what protects the business: a hard USD ceiling per user per month and
 * per day, a ceiling for the whole product per day, per-request size limits, and a kill switch. When a limit is hit the AI call is
 * refused - Mila keeps doing everything her rule-based engine can (calendar, contacts, tasks, drafts) and tells the person once.
 */
export class AiBudgetError extends Error {
  constructor(public code: "disabled" | "user_month" | "user_day" | "global_day" | "too_big" | "trial_pool", message: string) { super(message); }
}

interface Scope { userId: string; limited: string | null }
const als = new AsyncLocalStorage<Scope>();
export const runInAiScope = <T,>(userId: string, fn: () => Promise<T>): Promise<T> => als.run({ userId, limited: null }, fn);
/** Set when a call was refused during the current request, so the reply can say so (once). */
export const aiLimitedReason = (): string | null => als.getStore()?.limited ?? null;

// ------------------------------------------------------------------------------------------------ limits (env-tunable)
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(+v) ? +v : d);
export const globalDailyBudgetUsd = () => num(process.env.MILA_DAILY_AI_BUDGET_USD, 40); // the whole product, per UTC day
export const aiKillSwitch = () => process.env.MILA_AI_DISABLED === "1";
export const MAX_OUTPUT_TOKENS = () => num(process.env.MILA_MAX_OUTPUT_TOKENS, 2200);
export const MAX_INPUT_CHARS = () => num(process.env.MILA_MAX_INPUT_CHARS, 90_000);

export interface Allowance { monthlyUsd: number; dailyUsd: number; label: string; since: string }
/** What this user may cost us. Trial and each plan have their own ceiling (config), with safe defaults if the saved config predates them. */
export function allowanceFor(cfg: AppConfig, sub: { plan_key: string; status: string; period_start: string } | undefined): Allowance {
  const trial = cfg.trial ?? DEFAULT_CONFIG.trial!;
  const monthly = sub?.status === "trial" ? trial.ai_budget_usd
    : planBudget(cfg.plans.find((p) => p.key === sub?.plan_key) ?? DEFAULT_CONFIG.plans.find((p) => p.key === sub?.plan_key)) ?? (sub?.status === "dev" ? num(process.env.MILA_DEV_AI_BUDGET_USD, 25) : trial.ai_budget_usd);
  const daily = Math.max(1, monthly / (sub?.status === "trial" ? 3 : 8)); // nobody can burn the month in a day
  return { monthlyUsd: monthly, dailyUsd: daily, label: sub?.status === "trial" ? "trial" : "plan", since: sub?.period_start ?? new Date(Date.now() - 30 * 86_400_000).toISOString() };
}
export const planBudget = (p: PlanConfig | undefined) => p?.ai_budget_usd;

// ------------------------------------------------------------------------------------------------ meters
const memo = new Map<string, { at: number; month: number; day: number }>(); // per user, refreshed every 15 s from the usage ledger
const pending = new Map<string, number>(); // spend recorded in this process that the ledger may not show yet
let globalMemo: { at: number; usd: number } | null = null;

async function spentBy(userId: string, since: string) {
  const m = memo.get(userId);
  if (m && Date.now() - m.at < 15_000) return m;
  const rows = (await getStore().list("usage", userId));
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const month = rows.filter((r) => r.created_at >= since).reduce((n, r) => n + (r.est_cost_usd || 0), 0);
  const day = rows.filter((r) => r.created_at >= dayStart.toISOString()).reduce((n, r) => n + (r.est_cost_usd || 0), 0);
  const fresh = { at: Date.now(), month, day };
  memo.set(userId, fresh); pending.set(userId, 0);
  return fresh;
}
let poolMemo: { at: number; usd: number } | null = null;
/** What every trial user (testers excluded) has cost us so far, together. Trials have no card behind them, so this total has a hard ceiling. */
async function trialPoolSpent() {
  if (poolMemo && Date.now() - poolMemo.at < 60_000) return poolMemo.usd;
  const store = getStore();
  const [subs, usage] = await Promise.all([store.listAll("subscriptions"), store.listAll("usage")]);
  const trialUsers = new Set(subs.filter((x) => x.status === "trial").map((x) => x.user_id));
  const { testerEmails } = await import("../testers");
  const profiles = trialUsers.size ? await store.listAll("profiles") : [];
  const skip = new Set(profiles.filter((p) => testerEmails().includes((p.email ?? "").toLowerCase())).map((p) => p.id));
  const usd = usage.filter((r) => trialUsers.has(r.user_id) && !skip.has(r.user_id)).reduce((n, r) => n + (r.est_cost_usd || 0), 0);
  poolMemo = { at: Date.now(), usd };
  return usd;
}
export const trialPoolUsd = (cfg: AppConfig) => num(process.env.MILA_TRIAL_POOL_USD, cfg.trial?.pool_usd ?? DEFAULT_CONFIG.trial!.pool_usd ?? 20);

async function globalToday() {
  if (globalMemo && Date.now() - globalMemo.at < 30_000) return globalMemo.usd;
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const usd = (await getStore().listAll("usage")).filter((r) => r.created_at >= dayStart.toISOString()).reduce((n, r) => n + (r.est_cost_usd || 0), 0);
  globalMemo = { at: Date.now(), usd };
  return usd;
}

/** Throws AiBudgetError when this request must not reach the model. Cheap: two memoised ledger reads. */
export async function assertAiBudget(opts: { tier: string; inputChars: number; webSearch?: boolean }): Promise<void> {
  const scope = als.getStore();
  const refuse = (e: AiBudgetError) => { if (scope) scope.limited = e.code; throw e; };
  if (aiKillSwitch()) refuse(new AiBudgetError("disabled", "AI is switched off."));
  if (opts.inputChars > MAX_INPUT_CHARS() * 3) refuse(new AiBudgetError("too_big", "That request is too large."));
  if (await globalToday() + [...pending.values()].reduce((a, b) => a + b, 0) >= globalDailyBudgetUsd()) refuse(new AiBudgetError("global_day", "Daily AI budget reached."));
  if (!scope) return;
  const store = getStore();
  const [cfg, sub] = await Promise.all([store.getConfig(), store.list("subscriptions", scope.userId).then((l) => l[0])]);
  let a = allowanceFor(cfg, sub);
  const { isTesterId, TESTER_AI_MONTH_USD } = await import("../testers");
  if (await isTesterId(scope.userId)) a = { ...a, monthlyUsd: Math.max(a.monthlyUsd, TESTER_AI_MONTH_USD()), dailyUsd: Math.max(a.dailyUsd, TESTER_AI_MONTH_USD() / 4), label: "test account" }; // testers get a roomy allowance (still capped)
  const spent = await spentBy(scope.userId, a.since);
  const extra = pending.get(scope.userId) ?? 0;
  // expensive paths (deep reasoning, live web research) need real headroom, not just "not yet over"
  const need = opts.tier === "reasoning" || opts.webSearch ? 0.25 : 0;
  if (sub?.status === "trial" && a.label !== "test account" && await trialPoolSpent() + [...pending.values()].reduce((x, y) => x + y, 0) >= trialPoolUsd(cfg)) refuse(new AiBudgetError("trial_pool", "The free trial allowance is fully used for now."));
  if (spent.month + extra + need >= a.monthlyUsd) refuse(new AiBudgetError("user_month", `AI allowance for this ${a.label} reached.`));
  if (spent.day + extra + need >= a.dailyUsd) refuse(new AiBudgetError("user_day", "Daily AI allowance reached."));
}

/** Count a finished call immediately (the ledger row is written a moment later by the caller). */
export function noteAiSpend(usd: number) {
  const scope = als.getStore();
  if (scope) pending.set(scope.userId, (pending.get(scope.userId) ?? 0) + usd);
  if (globalMemo) globalMemo.usd += usd;
}

export const resetAiBudgetMemo = () => { memo.clear(); pending.clear(); globalMemo = null; poolMemo = null; };

/**
 * Plan decides model quality, not just volume. Premium (and anyone on the free trial, so they can taste the best) gets the
 * top reasoning model for hard questions. Standard stays on the strong standard model, thinking harder instead, so it is
 * a little weaker on the hardest jobs but still very solid. Pure function so it can be tested.
 */
export function planQuality(sub: { plan_key?: string; status?: string } | undefined): "premium" | "standard" {
  if (!sub) return "standard";
  if (sub.status === "trial" || sub.status === "dev") return "premium";
  if (sub.status === "active" && sub.plan_key !== "solo") return "premium"; // pro, team and any future higher plan
  return "standard";
}

/** The tier (and effort) this request should really run on for the signed-in person. Outside a user scope nothing changes. */
export async function tierForPlan(tier: "fast" | "standard" | "reasoning" | "vision" | "research", effort?: string): Promise<{ tier: typeof tier; effort?: string }> {
  const scope = als.getStore();
  if (!scope || tier !== "reasoning") return { tier, effort };
  const sub = (await getStore().list("subscriptions", scope.userId))[0];
  return planQuality(sub) === "premium" ? { tier, effort } : { tier: "standard", effort: "high" };
}
