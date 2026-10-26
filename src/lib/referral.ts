import { createHash } from "node:crypto";
import { getStore } from "./db/store";
import { grantCredits } from "./credits";
import type { Profile } from "./types";
import { firstNameOf } from "./names";
import { partnerByCode } from "./partner";

/**
 * Referral rewards, one time per friend, credits that never expire:
 *   monthly plan ($39):  referrer 200 credits, friend 100 bonus credits
 *   annual plan ($390):  referrer 550 credits, friend 400 bonus credits
 * They scale down if the friend paid less than list price (a partial discount code); a free checkout pays nothing.
 * One credit costs us at most about 1 cent of AI (plan AI ceiling / plan credits), so worst case a monthly referral costs about $3 against a $39 first payment
 * (200 + 100 credits) and an annual one about $9.50 against $390. Provisional: revisit when real usage shows the true cost per credit.
 */
export const REFERRER_CREDITS = { monthly: 200, annual: 550 } as const;
export const FRIEND_CREDITS = { monthly: 100, annual: 400 } as const;
/** The reward is released only after the friend has stayed subscribed this long, so refunds and chargebacks can't be farmed. */
export const HOLD_DAYS = 14;
export const MAX_REWARDED_REFERRALS = 15;
export const MAX_REWARDS_PER_30_DAYS = 5;

type PlanLike = { key: string; price_usd: number; credits: number; interval?: "month" | "year" };
const scaleFor = (plan: PlanLike, paidCents: number) => Math.min(1, paidCents / Math.max(1, plan.price_usd * 100));
/** Credits the REFERRER earns for one referral given the plan and what was actually paid. */
export function rewardCredits(plan: PlanLike | undefined, paidCents: number): number {
  if (!plan || paidCents <= 0) return 0;
  return Math.round(REFERRER_CREDITS[plan.interval === "year" ? "annual" : "monthly"] * scaleFor(plan, paidCents));
}
/** Credits the FRIEND gets as a welcome bonus on their first paid plan. */
export function friendBonusCredits(plan: PlanLike | undefined, paidCents: number): number {
  if (!plan || paidCents <= 0) return 0;
  return Math.round(FRIEND_CREDITS[plan.interval === "year" ? "annual" : "monthly"] * scaleFor(plan, paidCents));
}

const norm = (email: string) => { const [l, d] = email.trim().toLowerCase().split("@"); const base = (l ?? "").split("+")[0]; const dom = d === "googlemail.com" ? "gmail.com" : d; return `${dom === "gmail.com" ? base.replace(/\./g, "") : base}@${dom}`; };
const netHash = (ip: string) => createHash("sha256").update(`mila-net:${ip}`).digest("hex").slice(0, 12);

/** The person's own code (stored on their profile the first time it is needed). */
export async function ensureReferralCode(p: Profile): Promise<string> {
  const have = p.settings.referral?.code;
  if (have) return have;
  const code = createHash("sha256").update(`mila-ref:${p.id}`).digest("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
  await getStore().update("profiles", p.id, p.id, { settings: { ...p.settings, referral: { ...(p.settings.referral ?? {}), code } } } as never);
  return code;
}
export const referralLink = (code: string) => `${(process.env.NEXT_PUBLIC_APP_URL || "https://app.milarealestate.app").replace(/\/$/, "")}/welcome?ref=${encodeURIComponent(code)}`;

export async function findReferrer(code: string): Promise<Profile | null> {
  const c = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(c)) return null;
  return (await getStore().listAll("profiles")).find((p) => p.settings?.referral?.code === c && !p.is_demo) ?? null;
}

/** At sign-up (always called): remember the network the account came from and, if a code was used, who referred them. Self-referrals are ignored. */
export async function onSignup(newProfile: Profile, code: string | null | undefined, ip?: string): Promise<boolean> {
  const store = getStore();
  const base = { ...(newProfile.settings.referral ?? {}), ...(ip ? { signup_net: netHash(ip) } : {}) };
  let referredBy: string | undefined;
  let partner: { id: string; code: string } | undefined;
  const c = String(code ?? "").trim().toUpperCase();
  if (c) {
    const ref = await findReferrer(c);
    if (ref && ref.id !== newProfile.id && norm(ref.email) !== norm(newProfile.email)) referredBy = ref.id;
    else if (!ref) { const p = await partnerByCode(c); if (p && !(p.email && norm(p.email) === norm(newProfile.email))) partner = { id: p.id, code: c }; } // a partner signing up under their own code earns nothing // a creator partner's code: remembered so their commission can be worked out
  }
  await store.update("profiles", newProfile.id, newProfile.id, { settings: { ...newProfile.settings, referral: { ...base, ...(referredBy ? { referred_by: referredBy } : {}), ...(partner ? { partner } : {}) } } } as never);
  return !!referredBy || !!partner;
}

/** First name of the person who owns a code (for the invite page). Nothing else is exposed. */
export async function referrerFirstName(code: string): Promise<string | null> {
  const r = await findReferrer(code);
  if (r) return firstNameOf(r.full_name) || null;
  const p = await partnerByCode(code); // a creator partner's invite reads the same way
  return p ? firstNameOf(p.name) || null : null;
}

/**
 * A referred person's first PAID plan checkout (never a free or 100%-off one): start the hold, give the friend their welcome bonus.
 * Same-network sign-ups (the referrer and friend came from one connection) go to review instead of paying out automatically.
 */
export async function rewardReferral(refereeId: string, amountTotalCents: number | null | undefined, planKey?: string | null): Promise<{ started: boolean }> {
  if (!amountTotalCents || amountTotalCents <= 0) return { started: false };
  const store = getStore();
  const referee = await store.get("profiles", refereeId, refereeId);
  const r = referee?.settings.referral;
  if (!referee || !r?.referred_by || r.status || r.paid_at) return { started: false };
  const referrer = await store.get("profiles", r.referred_by, r.referred_by);
  if (!referrer) return { started: false };
  const sameNet = !!r.signup_net && r.signup_net === referrer.settings.referral?.signup_net;
  const plan = (await store.getConfig()).plans.find((p) => p.key === planKey);
  const credits = friendBonusCredits(plan, amountTotalCents);
  await store.update("profiles", refereeId, refereeId, { settings: { ...referee.settings, referral: { ...r, paid_at: new Date().toISOString(), plan_key: planKey ?? undefined, paid_cents: amountTotalCents, status: sameNet ? "review" : "pending" } } } as never);
  if (!sameNet && credits > 0) await grantCredits(refereeId, credits, "grant", "Welcome bonus: you joined through a friend's invite");
  return { started: true };
}

async function stillSubscribed(refereeId: string): Promise<boolean> {
  const sub = (await getStore().list("subscriptions", refereeId))[0];
  if (!sub || sub.status !== "active") return false;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !sub.stripe_subscription_id) return true;
  try {
    const x = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!x.ok) return true; // can't tell: try again next time rather than voiding
    const d = (await x.json()) as { status?: string };
    return d.status === "active" || d.status === "trialing";
  } catch { return true; }
}

/** Release the held rewards that are due (after HOLD_DAYS, still subscribed, within the caps). Pass a referrer id to settle only theirs. */
export async function settleReferrals(onlyReferrer?: string): Promise<{ rewarded: number; voided: number }> {
  const store = getStore();
  let rewarded = 0, voided = 0;
  const profiles = await store.listAll("profiles");
  const due = profiles.filter((p) => p.settings?.referral?.status === "pending" && p.settings.referral.paid_at && Date.now() - new Date(p.settings.referral.paid_at).getTime() >= HOLD_DAYS * 86_400_000 && (!onlyReferrer || p.settings.referral.referred_by === onlyReferrer));
  for (const f of due) {
    const r = f.settings.referral!;
    const by = r.referred_by!;
    if (!(await stillSubscribed(f.id))) { await store.update("profiles", f.id, f.id, { settings: { ...f.settings, referral: { ...r, status: "void" } } } as never); voided++; continue; }
    const earned = (await store.list("credit_transactions", by)).filter((t) => t.reason.startsWith("Referral reward"));
    const recent = earned.filter((t) => Date.now() - new Date(t.created_at).getTime() < 30 * 86_400_000).length;
    const byProfile = (await store.get("profiles", by, by))?.settings.referral?.rewarded_count ?? 0;
    if (Math.max(earned.length, byProfile) >= MAX_REWARDED_REFERRALS || recent >= MAX_REWARDS_PER_30_DAYS) continue; // stays pending; released when a slot opens
    if (earned.some((t) => t.reason.includes(`ref:${f.id}`))) { await store.update("profiles", f.id, f.id, { settings: { ...f.settings, referral: { ...r, status: "rewarded" } } } as never); continue; }
    const plan = (await store.getConfig()).plans.find((p) => p.key === r.plan_key);
    const credits = rewardCredits(plan, r.paid_cents ?? (plan ? plan.price_usd * 100 : 0));
    if (credits > 0) await grantCredits(by, credits, "grant", `Referral reward: ${firstNameOf(f.full_name)} joined and stayed subscribed (ref:${f.id})`);
    const refProfile = await store.get("profiles", by, by);
    if (refProfile) await store.update("profiles", by, by, { settings: { ...refProfile.settings, referral: { ...(refProfile.settings.referral ?? {}), rewarded_count: (refProfile.settings.referral?.rewarded_count ?? 0) + 1 } } } as never);
    await store.update("profiles", f.id, f.id, { settings: { ...f.settings, referral: { ...r, status: "rewarded" } } } as never);
    rewarded++;
  }
  return { rewarded, voided };
}

/** What the referrer sees: first name + last initial, and where each invite stands. */
export async function referralSummary(p: Profile) {
  await settleReferrals(p.id).catch(() => null);
  const code = await ensureReferralCode(p);
  const fresh = (await getStore().get("profiles", p.id, p.id)) ?? p;
  const all = (await getStore().listAll("profiles")).filter((x) => x.settings?.referral?.referred_by === p.id);
  const earned = (await getStore().list("credit_transactions", p.id)).filter((t) => t.reason.startsWith("Referral reward")).reduce((n, t) => n + t.delta, 0);
  const cfgPlans = (await getStore().getConfig()).plans;
  const pendingCredits = all.filter((x) => x.settings.referral?.status === "pending").reduce((n, x) => n + rewardCredits(cfgPlans.find((pl) => pl.key === x.settings.referral?.plan_key), x.settings.referral?.paid_cents ?? 0), 0);
  const monthlyPlan = cfgPlans.find((pl) => pl.key === "pro"), annualPlan = cfgPlans.find((pl) => pl.key === "pro_annual");
  const label = (x: Profile) => { const s = x.settings.referral?.status; if (s === "rewarded") return "rewarded"; if (s === "pending") { const left = Math.max(0, Math.ceil((HOLD_DAYS * 86_400_000 - (Date.now() - new Date(x.settings.referral!.paid_at!).getTime())) / 86_400_000)); return `pending:${left}`; } if (s === "review") return "review"; if (s === "void") return "void"; return "signed_up"; };
  return {
    code, link: referralLink(code), earnedCredits: earned, pendingCredits, monthlyReward: rewardCredits(monthlyPlan, (monthlyPlan?.price_usd ?? 0) * 100), annualReward: rewardCredits(annualPlan, (annualPlan?.price_usd ?? 0) * 100), friendMonthly: friendBonusCredits(monthlyPlan, (monthlyPlan?.price_usd ?? 0) * 100), friendAnnual: friendBonusCredits(annualPlan, (annualPlan?.price_usd ?? 0) * 100), rewardedCount: fresh.settings.referral?.rewarded_count ?? 0, full: (fresh.settings.referral?.rewarded_count ?? 0) >= MAX_REWARDED_REFERRALS, holdDays: HOLD_DAYS, cap: MAX_REWARDED_REFERRALS,
    referred: all.map((x) => { const [f, ...r] = x.full_name.split(/\s+/); return { name: `${f}${r.length ? ` ${r[r.length - 1][0]}.` : ""}`, state: label(x), at: x.created_at }; }).sort((a, b) => b.at.localeCompare(a.at)),
  };
}
