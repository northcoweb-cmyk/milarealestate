import { authMode } from "./auth";
import { aiProviderName } from "./ai/provider";
import { getStore, ephemeralStoreBlocked, schemaGaps, supabaseConfigured } from "./db/store";
import { googleConfigured } from "./integrations/google";
import type { ErrorLog } from "./types";
import { activeProvider, providerName } from "./media/providers";
import { monthStartIso } from "./media/usage";
import { rentcastConfigured, rentcastKeys } from "./listing-data/rentcast";
import { NIL_USER } from "./server/errors";

const DAY = 86_400_000;
const day = (iso: string) => iso.slice(0, 10);
const isTest = (email: string, demo: boolean) => demo || /@(test|example|demo)\.(dev|com|test)$/i.test(email) || /^qa\d+@/i.test(email);

export interface AdminReport {
  generatedAt: string;
  kpis: { accounts: number; testAccounts: number; signups24h: number; signups7d: number; signups30d: number; onboarded: number; active24h: number; active7d: number; active30d: number; messages7d: number; aiCost30d: number; aiCalls30d: number; openErrors: number; errors24h: number; unhandled7d: number };
  signups: { day: string; n: number }[];
  dau: { day: string; n: number }[];
  funnel: { step: string; n: number }[];
  adoption: { feature: string; users: number }[];
  accounts: { id: string; name: string; email: string; created_at: string; onboarded: boolean; test: boolean; last_active: string | null; messages: number; contacts: number; properties: number; events: number; tasks: number; posts: number; credits_used: number; errors7d: number; unhandled7d: number; location: string | null; brokerage: string | null }[];
  errors: { signature: string; source: string; level: string; message: string; count: number; users: number; firstSeen: string; lastSeen: string; route: string | null; stack: string | null; status: "open" | "resolved"; ids: string[]; emails: string[] }[];
  unhandled: { phrase: string; count: number; last: string }[];
  models: { model: string; calls: number; costUsd: number }[];
  apiUsage: { provider: string; calls: number; failed: number; units: number; costUsd: number }[];
  apiUsageByUser: { email: string; photoLookups: number; calls: number; costUsd: number }[];
  health: { store: string; persistent: boolean; blocked: boolean; schemaGaps: string[]; auth: string; ai: string | null; google: boolean; stripe: boolean; email: boolean; maps: boolean; propertyData: boolean; propertyKeys: number; photoProvider: string; photosConfigured: boolean; node: string; vercel: boolean; adminEmailsSet: boolean };
  attention: { severity: "high" | "medium" | "low"; title: string; detail: string; tab?: string }[];
}

const sigOf = (e: ErrorLog) => `${e.source}:${e.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|\d+/g, "#").slice(0, 100)}`;

export async function buildAdminReport(now = new Date()): Promise<AdminReport> {
  const s = getStore();
  const [profiles, messages, usage, contacts, props, events, tasks, posts, logs, docs, integrations, txns] = await Promise.all([
    s.listAll("profiles"), s.listAll("messages"), s.listAll("usage"), s.listAll("contacts"), s.listAll("properties"), s.listAll("calendar_events"),
    s.listAll("tasks"), s.listAll("social_posts"), s.listAll("error_logs"), s.listAll("documents"), s.listAll("integrations"), s.listAll("credit_transactions"),
  ]);
  const t = now.getTime();
  const since = (n: number) => new Date(t - n * DAY).toISOString();
  const by = <T extends { user_id: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) (m.get(r.user_id) ?? m.set(r.user_id, []).get(r.user_id)!).push(r); return m; };
  const mBy = by(messages), uBy = by(usage), cBy = by(contacts), pBy = by(props), eBy = by(events), tBy = by(tasks), sBy = by(posts), lBy = by(logs), dBy = by(docs), iBy = by(integrations);

  const accounts = profiles.map((p) => {
    const msgs = mBy.get(p.id) ?? [], us = uBy.get(p.id) ?? [];
    const userMsgs = msgs.filter((m) => m.role === "user");
    const lastTs = [...userMsgs.map((m) => m.created_at), ...us.map((x) => x.created_at)].sort().pop() ?? null;
    const myLogs = (lBy.get(p.id) ?? []).filter((l) => l.created_at >= since(7));
    return {
      id: p.id, name: p.full_name, email: p.email, created_at: p.created_at, onboarded: !!p.onboarded, test: isTest(p.email, !!p.is_demo), last_active: lastTs,
      messages: userMsgs.length, contacts: (cBy.get(p.id) ?? []).filter((c) => c.source !== "Demo data").length, properties: (pBy.get(p.id) ?? []).filter((x) => !x.is_demo).length,
      events: (eBy.get(p.id) ?? []).length, tasks: (tBy.get(p.id) ?? []).length, posts: (sBy.get(p.id) ?? []).length,
      credits_used: us.reduce((a, x) => a + (x.credits || 0), 0),
      errors7d: myLogs.filter((l) => l.level === "error").length, unhandled7d: myLogs.filter((l) => l.source === "unhandled").length,
      location: p.location ?? null, brokerage: p.brokerage ?? null,
    };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const real = accounts.filter((a) => !a.test);

  const series = (iso: (a: typeof real[number]) => string[], days: number) => Array.from({ length: days }, (_, i) => day(new Date(t - (days - 1 - i) * DAY).toISOString())).map((d) => ({ day: d, n: 0 }));
  const signups = series(() => [], 30); for (const a of real) { const x = signups.find((z) => z.day === day(a.created_at)); if (x) x.n++; }
  const dau = series(() => [], 14);
  const seen = new Set<string>();
  for (const m of messages) if (m.role === "user") { const a = real.find((r) => r.id === m.user_id); if (!a) continue; const d = day(m.created_at); const k = d + a.id; if (seen.has(k)) continue; seen.add(k); const x = dau.find((z) => z.day === d); if (x) x.n++; }

  const active = (n: number) => real.filter((a) => a.last_active && a.last_active >= since(n)).length;
  const aiRows = usage.filter((u) => u.created_at >= since(30) && u.provider !== "local");
  const models = [...aiRows.reduce((m, u) => { const k = `${u.provider}/${u.model}`; const c = m.get(k) ?? { model: k, calls: 0, costUsd: 0 }; c.calls++; c.costUsd += u.est_cost_usd || 0; return m.set(k, c); }, new Map<string, { model: string; calls: number; costUsd: number }>()).values()].sort((a, b) => b.costUsd - a.costUsd);

  const realIds = new Set(real.map((r) => r.id));
  const has = (m: Map<string, unknown[]>, f?: (r: any) => boolean) => real.filter((r) => (m.get(r.id) ?? []).some(f ?? (() => true))).length;
  const funnel = [
    { step: "Signed up", n: real.length }, { step: "Finished onboarding", n: real.filter((r) => r.onboarded).length },
    { step: "Sent Mila a message", n: real.filter((r) => r.messages > 0).length }, { step: "Added a contact", n: has(cBy, (c) => c.source !== "Demo data") },
    { step: "Added a listing", n: has(pBy, (c) => !c.is_demo) }, { step: "Booked an event", n: has(eBy) }, { step: "Made a social post", n: has(sBy) },
  ];
  const adoption = [
    { feature: "Chat with Mila", users: real.filter((r) => r.messages > 0).length }, { feature: "Calendar events", users: has(eBy) }, { feature: "Contacts", users: has(cBy, (c) => c.source !== "Demo data") },
    { feature: "Listings", users: has(pBy, (c) => !c.is_demo) }, { feature: "Social posts", users: has(sBy) }, { feature: "Tasks", users: has(tBy) },
    { feature: "Showing sheets", users: has(dBy, (d) => d.extracted?.kind === "showing_sheet") }, { feature: "Signature set up", users: profiles.filter((p) => realIds.has(p.id) && (p.settings?.brand?.credentials || p.settings?.brand?.cell)).length },
    { feature: "Google connected", users: has(iBy, (i) => i.provider === "google" && i.status === "connected") },
  ].sort((a, b) => b.users - a.users);

  const realLogs = logs.filter((l) => l.user_id === NIL_USER || realIds.has(l.user_id));
  const groups = new Map<string, AdminReport["errors"][number]>();
  for (const l of realLogs.filter((x) => x.source !== "unhandled").sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const sig = sigOf(l);
    const g = groups.get(sig) ?? { signature: sig, source: l.source, level: l.level, message: l.message, count: 0, users: 0, firstSeen: l.created_at, lastSeen: l.created_at, route: l.route, stack: l.stack, status: "resolved" as const, ids: [], emails: [] };
    g.count++; g.lastSeen = l.created_at; g.ids.push(l.id); g.route = l.route ?? g.route; g.stack = l.stack ?? g.stack;
    if (l.status === "open") g.status = "open";
    if (l.user_email && !g.emails.includes(l.user_email)) g.emails.push(l.user_email);
    groups.set(sig, g);
  }
  const errors = [...groups.values()].map((g) => ({ ...g, users: g.emails.length })).sort((a, b) => (a.status === b.status ? b.lastSeen.localeCompare(a.lastSeen) : a.status === "open" ? -1 : 1)).slice(0, 100);

  const un = new Map<string, { phrase: string; count: number; last: string }>();
  for (const l of realLogs.filter((x) => x.source === "unhandled" && x.created_at >= since(30))) {
    const k = l.message.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
    const c = un.get(k) ?? { phrase: l.message, count: 0, last: l.created_at }; c.count++; if (l.created_at > c.last) c.last = l.created_at; un.set(k, c);
  }
  const unhandled = [...un.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, 40);

  const monthStart = monthStartIso();
  const apiRows = (await s.listAll("api_usage").catch(() => [])).filter((r) => r.created_at >= monthStart);
  const apiUsage = [...new Set(apiRows.map((r) => r.provider))].map((provider) => { const r = apiRows.filter((x) => x.provider === provider); return { provider, calls: r.length, failed: r.filter((x) => !x.success).length, units: r.reduce((n, x) => n + x.units, 0), costUsd: +r.reduce((n, x) => n + x.est_cost_usd, 0).toFixed(3) }; });
  const apiUsageByUser = profiles.map((p) => { const r = apiRows.filter((x) => x.user_id === p.id); return { email: p.email, photoLookups: r.filter((x) => x.detail?.startsWith("attempt") && (x.provider === "zillapi" || x.provider === "rapidapi")).length, calls: r.length, costUsd: +r.reduce((n, x) => n + x.est_cost_usd, 0).toFixed(3) }; }).filter((u) => u.calls).sort((a, b) => b.costUsd - a.costUsd).slice(0, 30);
  const health: AdminReport["health"] = {
    store: s.kind, persistent: supabaseConfigured(), blocked: ephemeralStoreBlocked(), schemaGaps: [...schemaGaps], auth: authMode(), ai: aiProviderName(), google: googleConfigured(),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY), email: Boolean(process.env.RESEND_API_KEY), maps: Boolean(process.env.GOOGLE_MAPS_API_KEY), propertyData: rentcastConfigured(), propertyKeys: rentcastKeys().length, photoProvider: providerName(), photosConfigured: Boolean(activeProvider()), node: process.env.NODE_ENV ?? "", vercel: Boolean(process.env.VERCEL),
    adminEmailsSet: Boolean((process.env.ADMIN_EMAILS || "").trim()),
  };

  const openErr = errors.filter((e) => e.status === "open");
  const attention: AdminReport["attention"] = [];
  if (health.vercel && !health.persistent) attention.push({ severity: "high", title: "Data isn't being saved permanently", detail: "Supabase isn't configured on this deployment, so user data would be lost on the next deploy.", tab: "health" });
  if (health.schemaGaps.length) attention.push({ severity: "high", title: "Database is missing columns", detail: `Run the latest migrations in supabase/migrations. Missing: ${health.schemaGaps.slice(0, 6).join(", ")}. Until then, those values are not being saved.`, tab: "health" });
  if (!health.ai) attention.push({ severity: "high", title: "No AI key is connected", detail: "Mila is running on rules only — open questions get the generic fallback. Set OPENAI_API_KEY (or ANTHROPIC_API_KEY).", tab: "health" });
  if (!health.adminEmailsSet && health.vercel) attention.push({ severity: "medium", title: "ADMIN_EMAILS isn't set", detail: "Set ADMIN_EMAILS on Vercel so only your email can open this dashboard.", tab: "health" });
  for (const e of openErr.filter((x) => x.level === "error").slice(0, 5)) attention.push({ severity: e.count >= 5 || e.users >= 2 ? "high" : "medium", title: `${e.count}× ${e.source} error: ${e.message.slice(0, 70)}`, detail: `${e.users} user${e.users === 1 ? "" : "s"} · last ${e.lastSeen.slice(0, 16).replace("T", " ")} UTC${e.route ? ` · ${e.route}` : ""}`, tab: "errors" });
  const gerr = openErr.find((e) => e.message.startsWith("Google "));
  if (gerr) attention.push({ severity: "medium", title: "Google Maps is refusing requests, so house photos are missing", detail: `${gerr.message.slice(0, 140)} — open Health and press “Run check” for the exact fix.`, tab: "health" });
  if (unhandled.length) attention.push({ severity: "medium", title: `${unhandled.reduce((a, u) => a + u.count, 0)} messages Mila didn't understand (30d)`, detail: `Most common: “${unhandled[0].phrase.slice(0, 80)}”. Each is a missing skill or phrasing to add.`, tab: "errors" });
  const stuck = real.filter((r) => r.onboarded && r.messages === 0 && r.created_at < since(1));
  if (stuck.length) attention.push({ severity: "medium", title: `${stuck.length} account${stuck.length === 1 ? "" : "s"} signed up but never used Mila`, detail: stuck.slice(0, 4).map((r) => r.email).join(", "), tab: "accounts" });
  const lost = real.filter((r) => !r.onboarded && r.created_at < since(1));
  if (lost.length) attention.push({ severity: "low", title: `${lost.length} account${lost.length === 1 ? "" : "s"} never finished onboarding`, detail: lost.slice(0, 4).map((r) => r.email).join(", "), tab: "accounts" });
  const broke = real.filter((r) => r.errors7d > 0).sort((a, b) => b.errors7d - a.errors7d).slice(0, 3);
  for (const b of broke) attention.push({ severity: "medium", title: `${b.email} hit ${b.errors7d} error${b.errors7d === 1 ? "" : "s"} this week`, detail: "Worth reaching out — they may be stuck.", tab: "errors" });
  if (!health.google) attention.push({ severity: "low", title: "Google (Calendar/Gmail) isn't configured", detail: "Calendar sync and email sending are off for everyone.", tab: "health" });
  if (!health.propertyData) attention.push({ severity: "medium", title: "Property & listing data isn't connected", detail: "Without a RENTCAST_API_KEY, “prep for 123 Main St” falls back to a web-search guess and “new listings in my area” is unavailable. Many agents will expect this.", tab: "health" });
  if (health.propertyData && !health.maps) attention.push({ severity: "low", title: "Listing cards have no photos", detail: "Set GOOGLE_MAPS_API_KEY so cards show the street-level photo. RentCast itself returns no photos.", tab: "health" });
  if (!health.stripe) attention.push({ severity: "low", title: "Stripe isn't configured", detail: "Nobody can pay yet.", tab: "health" });
  const rank = { high: 0, medium: 1, low: 2 };
  attention.sort((a, b) => rank[a.severity] - rank[b.severity]);

  void txns;
  return {
    generatedAt: now.toISOString(),
    kpis: {
      accounts: real.length, testAccounts: accounts.length - real.length, signups24h: real.filter((a) => a.created_at >= since(1)).length, signups7d: real.filter((a) => a.created_at >= since(7)).length, signups30d: real.filter((a) => a.created_at >= since(30)).length,
      onboarded: real.filter((a) => a.onboarded).length, active24h: active(1), active7d: active(7), active30d: active(30),
      messages7d: messages.filter((m) => m.role === "user" && m.created_at >= since(7) && realIds.has(m.user_id)).length,
      aiCost30d: aiRows.reduce((a, u) => a + (u.est_cost_usd || 0), 0), aiCalls30d: aiRows.length,
      openErrors: openErr.length, errors24h: realLogs.filter((l) => l.level === "error" && l.created_at >= since(1)).length, unhandled7d: realLogs.filter((l) => l.source === "unhandled" && l.created_at >= since(7)).length,
    },
    signups, dau, funnel, adoption, accounts, errors, unhandled, models, health, attention, apiUsage, apiUsageByUser,
  };
}
