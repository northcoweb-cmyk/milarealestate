import { visiblePlans } from "./plans";
import { randomUUID } from "node:crypto";
import { getStore } from "./db/store";
import { DEFAULT_CONFIG } from "./config";
import { TESTER_TOPUP_CREDITS, isTesterId } from "./testers";
import type { AppConfig, CreditTransaction, Subscription, UsageRow } from "./types";

/**
 * Credits are the customer-facing abstraction. Under the hood every AI
 * operation is recorded in `usage` with provider/model/tokens/estimated USD
 * cost AND the credits charged, so the owner can see real margins per user.
 * Credit costs are config (app_config), never constants in agent code.
 */

export class InsufficientCredits extends Error {
  constructor(public balance: number, public needed: number) {
    super("You're out of Mila credits.");
  }
}

/** The trial is on in production (and anywhere MILA_TRIALS=1); local development and tests keep the roomy development credits. */
export const trialsEnabled = () => process.env.MILA_TRIALS === "1" || (process.env.MILA_TRIALS !== "0" && Boolean(process.env.VERCEL));

export class TrialEnded extends InsufficientCredits {
  constructor() { super(0, 1); this.message = "Your 7-day trial has ended."; }
}

export async function creditCost(key: string): Promise<number> {
  const cfg = await getStore().getConfig();
  return cfg.credit_costs[key] ?? cfg.credit_costs.chat_simple ?? 1;
}

export async function getBalance(userId: string): Promise<number> {
  const tx = await getStore().list("credit_transactions", userId);
  if (!tx.length) return 0;
  tx.sort((a, b) => a.created_at.localeCompare(b.created_at) || 0);
  return tx.reduce((n, t) => n + t.delta, 0);
}

/**
 * Annual subscribers pay once a year, so Stripe only tells us about the renewal. Their credits still arrive every month:
 * when a monthly window has passed, the subscription is checked with Stripe (still active?) and the allowance is refilled.
 */
export async function refillAnnual(userId: string) {
  const store = getStore();
  const sub = (await store.list("subscriptions", userId))[0];
  if (!sub || sub.status !== "active" || !sub.stripe_subscription_id || new Date(sub.period_end).getTime() > Date.now()) return;
  const cfg = await store.getConfig();
  if (cfg.plans.find((p) => p.key === sub.plan_key)?.interval !== "year") return;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return;
  try {
    const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return;
    const d = (await r.json()) as { status?: string };
    if (d.status !== "active" && d.status !== "trialing") { if (d.status === "canceled") await store.update("subscriptions", userId, sub.id, { status: "canceled" }); return; }
    const refill = await planRefillAmount(userId, sub); // before the new period starts
    const start = new Date();
    await store.update("subscriptions", userId, sub.id, { period_start: start.toISOString(), period_end: new Date(start.getTime() + 30 * 86_400_000).toISOString() });
    if (refill > 0) await grantCredits(userId, refill, "reset", `Monthly refill (annual plan) ${start.toISOString().slice(0, 7)}`);
  } catch { /* try again on the next request */ }
}

/**
 * Two kinds of credits share one balance. PLAN credits (the monthly allowance) are spent first and don't roll over. EXTRA credits (top-up packs,
 * referral rewards and bonuses) are spent only after the plan credits run out and never expire.
 * Because plan credits go first, everything above what's left of this period's allowance is extras.
 */
export async function planCreditsSpent(userId: string, periodStart: string): Promise<number> {
  return (await getStore().list("credit_transactions", userId)).filter((t) => t.kind === "spend" && t.created_at >= periodStart).reduce((n, t) => n - t.delta, 0);
}
export async function creditBuckets(userId: string, sub: { credits_per_period: number; period_start: string } | undefined) {
  const balance = await getBalance(userId);
  if (!sub) return { balance, plan: balance, extra: 0 };
  const plan = Math.min(balance, Math.max(0, sub.credits_per_period - (await planCreditsSpent(userId, sub.period_start))));
  return { balance, plan, extra: Math.max(0, balance - plan) };
}
/** At a monthly reset: refill exactly the plan credits that were spent this period (unused ones simply carry nothing extra), so extras are untouched. */
export async function planRefillAmount(userId: string, sub: { credits_per_period: number; period_start: string }): Promise<number> {
  return Math.min(sub.credits_per_period, await planCreditsSpent(userId, sub.period_start));
}

/** A finished free trial with no plan: the account is view-only until a plan is bought. Testers are never locked. */
export async function trialLocked(userId: string): Promise<boolean> {
  if (await isTesterId(userId)) return false;
  const sub = (await getStore().list("subscriptions", userId))[0];
  return sub?.status === "trial" && new Date(sub.period_end).getTime() < Date.now();
}

export async function ensureCredits(userId: string, needed: number) {
  if (needed <= 0) return;
  await refillAnnual(userId);
  // test accounts never run dry: top them up when they get low, and the trial clock does not apply to them
  if (await isTesterId(userId)) {
    const bal0 = await getBalance(userId);
    if (bal0 < Math.max(needed, 200)) await grantCredits(userId, TESTER_TOPUP_CREDITS, "grant", "Credit top-up");
    return;
  }
  // a finished trial with no plan: nothing paid runs (existing data stays visible)
  const sub = (await getStore().list("subscriptions", userId))[0];
  if (sub?.status === "trial" && new Date(sub.period_end).getTime() < Date.now()) throw new TrialEnded();
  const bal = await getBalance(userId);
  if (bal < needed) throw new InsufficientCredits(bal, needed);
}

export async function grantCredits(userId: string, amount: number, kind: CreditTransaction["kind"], reason: string) {
  const bal = await getBalance(userId);
  return getStore().insert("credit_transactions", userId, { kind, delta: amount, balance_after: bal + amount, reason, usage_id: null });
}

export interface UsageInput {
  userId: string;
  conversationId?: string | null;
  operation: string; // human label: "intent_routing", "open_house_workflow"
  creditKey: string; // key into config.credit_costs
  tier?: string;
  provider?: string;
  model?: string;
  inputUnits?: number;
  outputUnits?: number;
  estCostUsd?: number;
  creditsOverride?: number; // e.g. variable-cost imports
}

/** What one credit is worth in AI cost: a plan's AI ceiling divided by its credits (about 1 cent). A turn that uses more AI than that costs more credits. */
export const AI_USD_PER_CREDIT = 0.01;
// on globalThis so every copy of this module (route bundles, tests) shares one per-turn tally
const turnAiCost: Map<string, number> = ((globalThis as { __milaTurnCost?: Map<string, number> }).__milaTurnCost ??= new Map());
/** The AI cost recorded for this user since the last call, then reset. The agent calls it once per turn to price the turn by what it really used. */
export function takeTurnAiCost(userId: string): number { const v = turnAiCost.get(userId) ?? 0; turnAiCost.delete(userId); return v; }
/** Add third-party data cost (listing data, photo provider) to this turn so the agent pays for what they pull, at the same rate as AI. */
export function addTurnCost(userId: string, usd: number) { if (usd > 0) turnAiCost.set(userId, (turnAiCost.get(userId) ?? 0) + usd); }
export const creditsForAiCost = (usd: number, perCredit = AI_USD_PER_CREDIT) => Math.ceil(Math.max(0, usd) / perCredit - 1e-9);

/** What one credit is worth in cost for this person. A free trial is sized so its credits and its dollar cap run out together: 100 credits = the trial's AI allowance ($0.50), so $0.005 each. */
export async function usdPerCredit(userId: string): Promise<number> {
  if (await isTesterId(userId)) return AI_USD_PER_CREDIT;
  const store = getStore();
  const sub = (await store.list("subscriptions", userId))[0];
  if (sub?.status !== "trial") return AI_USD_PER_CREDIT;
  const t = (await store.getConfig()).trial ?? DEFAULT_CONFIG.trial!;
  return Math.min(AI_USD_PER_CREDIT, t.ai_budget_usd / Math.max(1, t.credits));
}

/** The trial's AI allowance is used up: the credits go to zero too, so the screen says "out of credits" instead of leaving credits that don't work. */
export async function exhaustTrialCredits(userId: string): Promise<void> {
  if (await isTesterId(userId)) return;
  const store = getStore();
  const sub = (await store.list("subscriptions", userId))[0];
  if (sub?.status !== "trial") return;
  const bal = await getBalance(userId);
  if (bal > 0) await store.insert("credit_transactions", userId, { kind: "adjust", delta: -bal, balance_after: 0, reason: "Trial allowance used", usage_id: null });
}

export async function recordUsage(u: UsageInput): Promise<{ usage: UsageRow; credits: number }> {
  const store = getStore();
  if ((u.estCostUsd ?? 0) > 0) turnAiCost.set(u.userId, (turnAiCost.get(u.userId) ?? 0) + (u.estCostUsd ?? 0));
  const credits = u.creditsOverride ?? (await creditCost(u.creditKey));
  const usage = await store.insert("usage", u.userId, {
    conversation_id: u.conversationId ?? null,
    operation: u.operation,
    tier: u.tier ?? "local",
    provider: u.provider ?? "local",
    model: u.model ?? "rules-engine",
    input_units: u.inputUnits ?? 0,
    output_units: u.outputUnits ?? 0,
    est_cost_usd: u.estCostUsd ?? 0,
    credits,
  });
  if (credits > 0) {
    const bal = await getBalance(u.userId);
    await store.insert("credit_transactions", u.userId, {
      kind: "spend", delta: -credits, balance_after: bal - credits, reason: u.operation, usage_id: usage.id,
    });
  }
  return { usage, credits };
}

export async function ensureSubscription(userId: string, cfg?: AppConfig): Promise<Subscription> {
  const store = getStore();
  const existing = (await store.list("subscriptions", userId))[0];
  if (existing) return existing;
  const c = cfg ?? (await store.getConfig());
  const start = new Date();
  if (trialsEnabled()) {
    const t = c.trial ?? DEFAULT_CONFIG.trial!;
    const trialSub = await store.insert("subscriptions", userId, { plan_key: "trial", status: "trial", credits_per_period: t.credits, period_start: start.toISOString(), period_end: new Date(start.getTime() + t.days * 86_400_000).toISOString(), stripe_customer_id: null, stripe_subscription_id: null });
    await grantCredits(userId, t.credits, "grant", `${t.days}-day free trial`);
    return trialSub;
  }
  const end = new Date(start.getTime() + 30 * 86_400_000);
  const sub = await store.insert("subscriptions", userId, {
    plan_key: "pro", status: "dev", credits_per_period: c.dev_credits,
    period_start: start.toISOString(), period_end: end.toISOString(),
    stripe_customer_id: null, stripe_subscription_id: null,
  });
  await grantCredits(userId, c.dev_credits, "grant", "Development credits (billing not configured)");
  return sub;
}

export async function creditSummary(userId: string) {
  const store = getStore();
  await refillAnnual(userId);
  const [sub, tx, usage, cfg] = await Promise.all([
    ensureSubscription(userId),
    store.list("credit_transactions", userId),
    store.list("usage", userId),
    store.getConfig(),
  ]);
  const periodStart = sub.period_start;
  const spentThisPeriod = tx.filter((t) => t.kind === "spend" && t.created_at >= periodStart).reduce((n, t) => n - t.delta, 0);
  const balance = tx.reduce((n, t) => n + t.delta, 0);
  const planLeft = Math.min(balance, Math.max(0, sub.credits_per_period - spentThisPeriod));
  const history = [...usage].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
  const trial = sub.status === "trial" ? { endsAt: sub.period_end, daysLeft: Math.max(0, Math.ceil((new Date(sub.period_end).getTime() - Date.now()) / 86_400_000)), day: Math.min(7, Math.max(1, Math.floor((Date.now() - new Date(sub.period_start).getTime()) / 86_400_000) + 1)), expired: new Date(sub.period_end).getTime() < Date.now() } : null;
  return { balance, planCredits: planLeft, extraCredits: Math.max(0, balance - planLeft), trial, allowance: sub.credits_per_period, spentThisPeriod, resetsAt: sub.period_end, status: sub.status, plan: cfg.plans.find((p) => p.key === sub.plan_key) ?? null, history, packs: cfg.packs, creditPrice: cfg.credit_price_usd ?? 0.05, plans: visiblePlans(cfg, sub.plan_key) };
}

/** Owner-level margin report: credits, real AI cost, and revenue per user. */
export async function marginReport() {
  const store = getStore();
  const [profiles, usage, subs, cfg, tx] = await Promise.all([store.listAll("profiles"), store.listAll("usage"), store.listAll("subscriptions"), store.getConfig(), store.listAll("credit_transactions")]);
  return profiles.map((p) => {
    const u = usage.filter((x) => x.user_id === p.id);
    const sub = subs.find((s) => s.user_id === p.id);
    const plan = cfg.plans.find((x) => x.key === sub?.plan_key);
    const revenue = sub?.status === "active" ? plan?.price_usd ?? 0 : 0;
    const cost = u.reduce((n, x) => n + x.est_cost_usd, 0);
    const credits = u.reduce((n, x) => n + x.credits, 0);
    return {
      id: p.id, balance: tx.filter((t) => t.user_id === p.id).reduce((n, t) => n + t.delta, 0),
      user: p.full_name, email: p.email, credits_used: credits,
      ai_cost_usd: +cost.toFixed(4), revenue_usd: revenue,
      ai_cost_pct_of_revenue: revenue ? +((cost / revenue) * 100).toFixed(2) : null,
      operations: u.length,
    };
  });
}

export const newId = () => randomUUID();
