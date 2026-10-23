import { table } from "./sb";
import { launchAt } from "./announce";

const isTest = (email: string, demo: boolean) => demo || /@(test|example|demo)\.(dev|com|test)$/i.test(email) || /^qa\d+@/i.test(email);
const short = (full: string, email: string) => { const parts = (full || email.split("@")[0]).trim().split(/\s+/); const f = parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : "Someone"; return parts[1] ? `${f} ${parts[1][0].toUpperCase()}.` : f; };

export interface LiveEvent { id: string; at: string; kind: "signup" | "setup" | "first_message" | "paid" | "queued" | "granted"; who: string; detail?: string }
export interface LiveData {
  now: string; launchAt: string; launched: boolean;
  waitlist: number; queued: number; invitedWaiting: number; claimed: number; accounts: number; accountsToday: number; setup: number; usingMila: number; activeNow: number; trials: number; paid: number; seatCap: number; seatsLeft: number;
  aiTodayUsd: number; creditsToday: number; perHour: { hour: string; n: number }[]; events: LiveEvent[];
}

/** Everything the launch-day screen shows, from a few narrow queries so it can be refreshed every few seconds. */
export async function buildLive(): Promise<LiveData> {
  const now = Date.now(), launch = launchAt().getTime();
  const dayAgo = new Date(now - 36 * 3_600_000).toISOString();
  const [profiles, subs, msgs, usage, wait] = await Promise.all([
    table<{ id: string; email: string; full_name: string; created_at: string; updated_at: string; onboarded: boolean; is_demo: boolean }>("profiles", { select: "id,email,full_name,created_at,updated_at,onboarded,is_demo", order: "created_at.desc", max: 5000 }),
    table<{ user_id: string; plan_key: string; status: string; period_start: string; period_end: string; stripe_subscription_id: string | null }>("subscriptions", { select: "user_id,plan_key,status,period_start,period_end,stripe_subscription_id", max: 5000 }),
    table<{ user_id: string; created_at: string }>("messages", { select: "user_id,created_at", filter: `role=eq.user&created_at=gte.${encodeURIComponent(dayAgo)}`, order: "created_at.desc", max: 5000 }),
    table<{ est_cost_usd: number; credits: number; created_at: string }>("usage", { select: "est_cost_usd,credits,created_at", filter: `created_at=gte.${encodeURIComponent(dayAgo)}`, max: 20000 }),
    table<{ id: string; email: string; name: string | null; created_at: string; invited_at: string | null; claimed_at: string | null }>("waitlist", { select: "id,email,name,created_at,invited_at,claimed_at", order: "created_at.desc", max: 20000 }),
  ]);
  const real = (profiles ?? []).filter((p) => !isTest(p.email, p.is_demo));
  const ids = new Set(real.map((p) => p.id));
  const nameOf = new Map(real.map((p) => [p.id, short(p.full_name, p.email)]));
  const firstMsg = new Map<string, string>(); // earliest message per person in the window
  const lastMsgAt = new Map<string, number>();
  for (const m of msgs ?? []) { if (!ids.has(m.user_id)) continue; const t = new Date(m.created_at).getTime(); if (!firstMsg.has(m.user_id) || m.created_at < firstMsg.get(m.user_id)!) firstMsg.set(m.user_id, m.created_at); if (t > (lastMsgAt.get(m.user_id) ?? 0)) lastMsgAt.set(m.user_id, t); }
  const startOfDay = new Date(new Date(now).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) + "T00:00:00-04:00").getTime();
  const paidSubs = (subs ?? []).filter((s) => ids.has(s.user_id) && s.status === "active" && s.stripe_subscription_id);
  const events: LiveEvent[] = [];
  for (const p of real) {
    events.push({ id: `s-${p.id}`, at: p.created_at, kind: "signup", who: nameOf.get(p.id)! });
    if (p.onboarded) events.push({ id: `o-${p.id}`, at: p.updated_at, kind: "setup", who: nameOf.get(p.id)! });
  }
  for (const [id, at] of firstMsg) events.push({ id: `m-${id}`, at, kind: "first_message", who: nameOf.get(id)! });
  for (const s of paidSubs) events.push({ id: `p-${s.user_id}`, at: s.period_start, kind: "paid", who: nameOf.get(s.user_id)!, detail: s.plan_key === "pro_annual" ? "Annual plan" : "Monthly plan" });
  for (const w of (wait ?? []).slice(0, 400)) { // newest 400 is plenty for a live feed
    if (isTest(w.email, false)) continue;
    const who = short(w.name ?? "", w.email);
    events.push({ id: `w-${w.id}`, at: w.created_at, kind: "queued", who });
    if (w.invited_at) events.push({ id: `g-${w.id}`, at: w.invited_at, kind: "granted", who, detail: w.claimed_at ? "signed in" : "email sent" });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  const hours: { hour: string; n: number }[] = [];
  for (let i = 11; i >= 0; i--) { const h0 = Math.floor(now / 3_600_000) * 3_600_000 - i * 3_600_000; hours.push({ hour: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric" }).format(h0), n: real.filter((p) => { const t = new Date(p.created_at).getTime(); return t >= h0 && t < h0 + 3_600_000; }).length }); }
  const cap = Number(process.env.SEAT_CAP ?? 25) || 0;
  const today = (usage ?? []).filter((u) => new Date(u.created_at).getTime() >= startOfDay);
  return {
    now: new Date(now).toISOString(), launchAt: new Date(launch).toISOString(), launched: now >= launch,
    waitlist: wait?.length ?? 0, queued: (wait ?? []).filter((w) => !w.invited_at && !w.claimed_at).length, invitedWaiting: (wait ?? []).filter((w) => w.invited_at && !w.claimed_at).length, claimed: (wait ?? []).filter((w) => w.claimed_at).length, accounts: real.length, accountsToday: real.filter((p) => new Date(p.created_at).getTime() >= Math.max(startOfDay, launch - 12 * 3_600_000)).length,
    setup: real.filter((p) => p.onboarded).length, usingMila: firstMsg.size, activeNow: [...lastMsgAt.values()].filter((t) => now - t < 15 * 60_000).length,
    trials: real.filter((p) => !paidSubs.some((s) => s.user_id === p.id)).length, paid: paidSubs.length, seatCap: cap, seatsLeft: Math.max(0, cap - real.length),
    aiTodayUsd: today.reduce((n, u) => n + Number(u.est_cost_usd || 0), 0), creditsToday: today.reduce((n, u) => n + Number(u.credits || 0), 0), perHour: hours, events: events.slice(0, 40),
  };
}
