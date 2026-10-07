import { table } from "./sb";

const DAY = 86_400_000;
const TZ = "America/New_York";
export const dayKey = (iso: string | number | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
export const fmt = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "never");
export const ago = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return "never";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 129600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
export const usd = (n: number) => (n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);

interface Profile { id: string; email: string; full_name: string; created_at: string; onboarded: boolean; is_demo: boolean; brokerage: string | null; location: string | null }
interface Sub { user_id: string; plan_key: string; status: string; period_start: string; period_end: string; stripe_subscription_id: string | null }
interface Msg { user_id: string; role: string; created_at: string }
interface Use { user_id: string; operation: string; model: string; est_cost_usd: number; credits: number; created_at: string }
interface Err { id: string; level: string; source: string; message: string; stack: string | null; route: string | null; user_email: string | null; status: string; created_at: string }
interface ApiU { user_id?: string; provider: string; endpoint: string; success: boolean; est_cost_usd: number; created_at: string }
interface Wait { id: string; email: string; name: string | null; source: string | null; created_at: string; status?: string | null; invited_at?: string | null; claimed_at?: string | null }

const isTest = (email: string, demo: boolean) => demo || /@(test|example|demo)\.(dev|com|test)$/i.test(email) || /^qa\d+@/i.test(email);
const lastDays = (n: number, now: number) => Array.from({ length: n }, (_, i) => dayKey(now - (n - 1 - i) * DAY));
const countBy = (days: string[], items: string[]) => { const m = new Map(days.map((d) => [d, 0])); for (const k of items) if (m.has(k)) m.set(k, m.get(k)! + 1); return days.map((d) => ({ day: d, n: m.get(d)! })); };

export async function buildReport() {
  const now = Date.now();
  const since60 = new Date(now - 60 * DAY).toISOString();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const [profiles, subs, msgs, usage, errs, apiU, wait] = await Promise.all([
    table<Profile>("profiles", { select: "id,email,full_name,created_at,onboarded,is_demo,brokerage,location", order: "created_at.desc" }),
    table<Sub>("subscriptions", { select: "user_id,plan_key,status,period_start,period_end,stripe_subscription_id" }),
    table<Msg>("messages", { select: "user_id,role,created_at", filter: `created_at=gte.${since60}` }),
    table<Use>("usage", { select: "user_id,operation,model,est_cost_usd,credits,created_at", filter: `created_at=gte.${since60}` }),
    table<Err>("error_logs", { select: "id,level,source,message,stack,route,user_email,status,created_at", filter: `created_at=gte.${since30}`, order: "created_at.desc", max: 5000 }),
    table<ApiU>("api_usage", { select: "user_id,provider,endpoint,success,est_cost_usd,created_at", filter: `created_at=gte.${since30}` }),
    (async () => (await table<Wait>("waitlist", { select: "id,email,name,source,created_at,status,invited_at,claimed_at", order: "created_at.desc" })) ?? (await table<Wait>("waitlist", { select: "id,email,name,source,created_at,status", order: "created_at.desc" })))(),
  ]);
  const missing = [["profiles", profiles], ["subscriptions", subs], ["messages", msgs], ["usage", usage], ["error_logs", errs], ["api_usage", apiU], ["waitlist", wait]].filter(([, v]) => v === null).map(([k]) => k as string);
  const P = profiles ?? [], S = subs ?? [], M = msgs ?? [], U = usage ?? [], E = errs ?? [], A = apiU ?? [], W = wait ?? [];

  const real = P.filter((p) => !isTest(p.email, p.is_demo));
  const realIds = new Set(real.map((p) => p.id));
  const days30 = lastDays(30, now);
  const userMsgs = M.filter((m) => m.role === "user" && realIds.has(m.user_id));
  const activity = [...userMsgs.map((m) => ({ id: m.user_id, at: m.created_at })), ...U.filter((u) => realIds.has(u.user_id)).map((u) => ({ id: u.user_id, at: u.created_at }))];
  const lastActive = new Map<string, string>();
  for (const a of activity) if (!lastActive.get(a.id) || a.at > lastActive.get(a.id)!) lastActive.set(a.id, a.at);
  const activeSince = (ms: number) => new Set(activity.filter((a) => new Date(a.at).getTime() >= now - ms).map((a) => a.id)).size;
  const dauSets = new Map<string, Set<string>>();
  for (const a of activity) { const d = dayKey(a.at); (dauSets.get(d) ?? dauSets.set(d, new Set()).get(d)!).add(a.id); }

  const subOf = (id: string) => S.filter((s) => s.user_id === id).sort((a, b) => b.period_start.localeCompare(a.period_start))[0];
  const costOf = new Map<string, number>(); const turnsOf = new Map<string, number>();
  for (const u of U) { costOf.set(u.user_id, (costOf.get(u.user_id) ?? 0) + Number(u.est_cost_usd || 0)); if (u.operation.startsWith("turn:")) turnsOf.set(u.user_id, (turnsOf.get(u.user_id) ?? 0) + 1); }

  const users = real.map((p) => {
    const s = subOf(p.id);
    const paid = !!s?.stripe_subscription_id && s.status === "active";
    const state = paid ? "paid" : s?.status === "trial" ? (new Date(s.period_end).getTime() < now ? "trial ended" : "trial") : s ? s.status : "none";
    const trialDay = s?.status === "trial" ? Math.min(7, Math.max(1, Math.floor((now - new Date(s.period_start).getTime()) / DAY) + 1)) : null;
    return { id: p.id, email: p.email, name: p.full_name, brokerage: p.brokerage, created_at: p.created_at, onboarded: p.onboarded, plan: s?.plan_key ?? "", state, trialDay, last: lastActive.get(p.id) ?? null, turns: turnsOf.get(p.id) ?? 0, cost: costOf.get(p.id) ?? 0 };
  });

  // trial funnel: did each trial user do something on the day it should happen (day counted from when their trial started)
  const trialUsers = real.map((p) => ({ p, s: subOf(p.id) })).filter((x) => x.s && (x.s.status === "trial" || x.s.status === "active" || x.s.plan_key === "trial"));
  const funnel = { started: trialUsers.length, d1: 0, d2: 0, d3: 0, d5: 0, d7: 0, paid: 0 };
  for (const { p, s } of trialUsers) {
    const t0 = new Date(s!.status === "trial" ? s!.period_start : p.created_at).getTime();
    const idxs = new Set(activity.filter((a) => a.id === p.id).map((a) => Math.floor((new Date(a.at).getTime() - t0) / DAY)));
    if (idxs.has(0)) funnel.d1++;
    if (idxs.has(1)) funnel.d2++;
    if (idxs.has(2) || idxs.has(3)) funnel.d3++;
    if ([...idxs].some((i) => i >= 4)) funnel.d5++;
    if ([...idxs].some((i) => i >= 6)) funnel.d7++;
    if (s!.stripe_subscription_id && s!.status === "active") funnel.paid++;
  }

  // errors grouped by what they say (numbers and ids collapsed)
  const sig = (e: Err) => `${e.source}:${e.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|\d+/g, "#").slice(0, 100)}`;
  const groups = new Map<string, { sig: string; source: string; level: string; message: string; route: string | null; stack: string | null; count: number; users: Set<string>; first: string; last: string; open: boolean }>();
  for (const e of E) {
    const k = sig(e); const g = groups.get(k);
    if (!g) groups.set(k, { sig: k, source: e.source, level: e.level, message: e.message, route: e.route, stack: e.stack, count: 1, users: new Set(e.user_email ? [e.user_email] : []), first: e.created_at, last: e.created_at, open: e.status !== "resolved" });
    else { g.count++; if (e.user_email) g.users.add(e.user_email); if (e.created_at < g.first) g.first = e.created_at; if (e.created_at > g.last) g.last = e.created_at; if (e.status !== "resolved") g.open = true; }
  }
  const errors = [...groups.values()].sort((a, b) => b.last.localeCompare(a.last)).map((g) => ({ ...g, users: [...g.users] }));

  // AI + API spend
  const today = dayKey(now);
  const costByDay = new Map<string, number>();
  const byModel = new Map<string, { calls: number; cost: number }>();
  for (const u of U) { const d = dayKey(u.created_at); costByDay.set(d, (costByDay.get(d) ?? 0) + Number(u.est_cost_usd || 0)); const m = byModel.get(u.model) ?? { calls: 0, cost: 0 }; m.calls++; m.cost += Number(u.est_cost_usd || 0); byModel.set(u.model, m); }
  const emailOf = new Map(P.map((p) => [p.id, p.email]));
  // per-user economics: AI cost + paid data lookups (RentCast etc.) against what they pay. Trials and testers show $0 revenue on purpose.
  const PRICE: Record<string, number> = { solo: 29, pro: 49 };
  const apiCostOf = new Map<string, number>();
  for (const a of A) if (a.user_id) apiCostOf.set(a.user_id, (apiCostOf.get(a.user_id) ?? 0) + Number(a.est_cost_usd || 0));
  const byUser = [...new Set([...costOf.keys(), ...apiCostOf.keys()])].map((id) => {
    const s = subOf(id); const paid = !!s && s.status === "active" && !!s.stripe_subscription_id;
    const cost = (costOf.get(id) ?? 0) + (apiCostOf.get(id) ?? 0), revenue = paid ? PRICE[s!.plan_key] ?? 0 : 0;
    return { email: emailOf.get(id) ?? id.slice(0, 8), cost, ai: costOf.get(id) ?? 0, data: apiCostOf.get(id) ?? 0, turns: turnsOf.get(id) ?? 0, plan: s?.plan_key ?? "", paid, revenue, margin: revenue - cost };
  }).sort((a, b) => b.cost - a.cost).slice(0, 25);
  const apiBy = new Map<string, { calls: number; failed: number; cost: number }>();
  for (const a of A) { const m = apiBy.get(a.provider) ?? { calls: 0, failed: 0, cost: 0 }; m.calls++; if (!a.success) m.failed++; m.cost += Number(a.est_cost_usd || 0); apiBy.set(a.provider, m); }

  const waitEmails = new Set(W.map((w) => w.email.toLowerCase()));
  const accountEmails = new Set(real.map((p) => p.email.toLowerCase()));
  const joined = [...waitEmails].filter((e) => accountEmails.has(e)).length;
  const onboarded = real.filter((p) => p.onboarded).length;
  const firstTask = new Set(userMsgs.map((m) => m.user_id)).size;
  const sinceIso = (ms: number) => new Date(now - ms).toISOString();

  return {
    now, missing,
    kpis: {
      users: real.length, testUsers: P.length - real.length, signups24h: real.filter((p) => p.created_at >= sinceIso(DAY)).length, signups7d: real.filter((p) => p.created_at >= sinceIso(7 * DAY)).length,
      onboarded, active24h: activeSince(DAY), active7d: activeSince(7 * DAY), waitlist: W.length, wait24h: W.filter((w) => w.created_at >= sinceIso(DAY)).length, wait7d: W.filter((w) => w.created_at >= sinceIso(7 * DAY)).length,
      trials: users.filter((u) => u.state === "trial").length, paid: users.filter((u) => u.state === "paid").length,
      errors24h: E.filter((e) => e.level === "error" && e.created_at >= sinceIso(DAY)).length, openErrors: errors.filter((g) => g.open && g.level === "error").length,
      aiToday: costByDay.get(today) ?? 0, ai30d: [...costByDay.entries()].filter(([d]) => days30.includes(d)).reduce((a, [, v]) => a + v, 0),
    },
    signupsByDay: countBy(days30, real.map((p) => dayKey(p.created_at))),
    waitByDay: countBy(days30, W.map((w) => dayKey(w.created_at))),
    dau: days30.map((d) => ({ day: d, n: dauSets.get(d)?.size ?? 0 })),
    costByDay: days30.map((d) => ({ day: d, n: costByDay.get(d) ?? 0 })),
    growth: [
      { step: "Waitlist signups", n: W.length }, { step: "Created an account", n: real.length }, { step: "Finished onboarding", n: onboarded },
      { step: "Sent Mila a request", n: firstTask }, { step: "On a trial", n: users.filter((u) => ["trial", "trial ended", "paid"].includes(u.state)).length }, { step: "Paying", n: users.filter((u) => u.state === "paid").length },
    ],
    waitToAccount: { joined, of: W.length },
    users, funnel, errors, wait: W,
    spend: { byModel: [...byModel.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.cost - a.cost), byUser, api: [...apiBy.entries()].map(([provider, v]) => ({ provider, ...v })).sort((a, b) => b.cost - a.cost) },
    waitSources: Object.entries(W.reduce<Record<string, number>>((m, w) => { const k = w.source || "direct"; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]),
  };
}
export type Report = Awaited<ReturnType<typeof buildReport>>;
