import { createHash } from "node:crypto";
import { getStore } from "./db/store";
import { grantCredits } from "./credits";
import type { Profile } from "./types";

/** Credits a referrer earns when someone they referred pays for a plan, and what the new customer gets too. Provisional until real usage shows the cost per credit. */
export const REFERRER_CREDITS = 500;
export const REFEREE_CREDITS = 200;
export const MAX_REWARDED_REFERRALS = 20;

const norm = (email: string) => { const [l, d] = email.trim().toLowerCase().split("@"); const base = (l ?? "").split("+")[0]; return `${/^(gmail|googlemail)\.com$/.test(d ?? "") ? base.replace(/\./g, "") : base}@${d === "googlemail.com" ? "gmail.com" : d}`; };

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
  if (!/^[A-Z0-9]{6,12}$/.test(code)) return null;
  return (await getStore().listAll("profiles")).find((p) => p.settings?.referral?.code === code && !p.is_demo) ?? null;
}

/** At sign-up: remember who sent this person. Self-referrals (same account or the same inbox through dots/+tags) are ignored. */
export async function recordReferral(newProfile: Profile, code: string | null | undefined): Promise<boolean> {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return false;
  const ref = await findReferrer(c);
  if (!ref || ref.id === newProfile.id || norm(ref.email) === norm(newProfile.email)) return false;
  await getStore().update("profiles", newProfile.id, newProfile.id, { settings: { ...newProfile.settings, referral: { ...(newProfile.settings.referral ?? {}), referred_by: ref.id } } } as never);
  return true;
}

/**
 * When a referred person's first PAID plan checkout completes: the referrer gets REFERRER_CREDITS and the new customer gets REFEREE_CREDITS, once.
 * Free checkouts (a 100% promo code, $0 total) never pay out. Idempotent: the referee's id is the key.
 */
export async function rewardReferral(refereeId: string, amountTotalCents: number | null | undefined): Promise<{ rewarded: boolean }> {
  if (!amountTotalCents || amountTotalCents <= 0) return { rewarded: false };
  const store = getStore();
  const referee = await store.get("profiles", refereeId, refereeId);
  const by = referee?.settings.referral?.referred_by;
  if (!referee || !by || referee.settings.referral?.rewarded) return { rewarded: false };
  const referrer = await store.get("profiles", by, by);
  if (!referrer) return { rewarded: false };
  const tag = `ref:${refereeId}`;
  const already = (await store.list("credit_transactions", by)).filter((t) => t.reason.startsWith("Referral reward"));
  if (already.some((t) => t.reason.includes(tag))) return { rewarded: false };
  if (already.length < MAX_REWARDED_REFERRALS) await grantCredits(by, REFERRER_CREDITS, "grant", `Referral reward: ${referee.full_name.split(/\s+/)[0]} joined and subscribed (${tag})`);
  await grantCredits(refereeId, REFEREE_CREDITS, "grant", "Welcome bonus: you joined through a friend's invite");
  await store.update("profiles", refereeId, refereeId, { settings: { ...referee.settings, referral: { ...referee.settings.referral, rewarded: true } } } as never);
  return { rewarded: true };
}

/** What the referrer sees: first name + last initial, whether they signed up or have paid. */
export async function referralSummary(p: Profile) {
  const code = await ensureReferralCode(p);
  const all = (await getStore().listAll("profiles")).filter((x) => x.settings?.referral?.referred_by === p.id);
  const earned = (await getStore().list("credit_transactions", p.id)).filter((t) => t.reason.startsWith("Referral reward")).reduce((n, t) => n + t.delta, 0);
  return {
    code, link: referralLink(code), earnedCredits: earned, perReferral: REFERRER_CREDITS, friendBonus: REFEREE_CREDITS, cap: MAX_REWARDED_REFERRALS,
    referred: all.map((x) => { const [f, ...r] = x.full_name.split(/\s+/); return { name: `${f}${r.length ? ` ${r[r.length - 1][0]}.` : ""}`, status: x.settings.referral?.rewarded ? "paid" : "signed up", at: x.created_at }; }).sort((a, b) => b.at.localeCompare(a.at)),
  };
}
