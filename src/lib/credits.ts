import { randomUUID } from "node:crypto";
import { getStore } from "./db/store";
import { DEFAULT_CONFIG } from "./config";
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

export async function ensureCredits(userId: string, needed: number) {
  if (needed <= 0) return;
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

export async function recordUsage(u: UsageInput): Promise<{ usage: UsageRow; credits: number }> {
  const store = getStore();
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
  const [sub, tx, usage, cfg] = await Promise.all([
    ensureSubscription(userId),
    store.list("credit_transactions", userId),
    store.list("usage", userId),
    store.getConfig(),
  ]);
  const periodStart = sub.period_start;
  const spentThisPeriod = tx.filter((t) => t.kind === "spend" && t.created_at >= periodStart).reduce((n, t) => n - t.delta, 0);
  const balance = tx.reduce((n, t) => n + t.delta, 0);
  const history = [...usage].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
  const trial = sub.status === "trial" ? { endsAt: sub.period_end, daysLeft: Math.max(0, Math.ceil((new Date(sub.period_end).getTime() - Date.now()) / 86_400_000)), day: Math.min(7, Math.max(1, Math.floor((Date.now() - new Date(sub.period_start).getTime()) / 86_400_000) + 1)), expired: new Date(sub.period_end).getTime() < Date.now() } : null;
  return { balance, trial, allowance: sub.credits_per_period, spentThisPeriod, resetsAt: sub.period_end, status: sub.status, plan: cfg.plans.find((p) => p.key === sub.plan_key) ?? null, history, packs: cfg.packs, creditPrice: cfg.credit_price_usd ?? 0.05, plans: cfg.plans };
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
