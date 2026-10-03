"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw, Search } from "lucide-react";
import type { AdminReport } from "@/lib/admin-report";
import { Pill, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { PricingTab } from "./pricing-tab";

type Tab = "overview" | "accounts" | "errors" | "health" | "pricing";
const TABS: [Tab, string][] = [["overview", "Overview"], ["accounts", "Accounts"], ["errors", "Errors & gaps"], ["health", "Health"], ["pricing", "Pricing"]];

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : m < 43200 ? `${Math.floor(m / 1440)}d ago` : `${Math.floor(m / 43200)}mo ago`;
};
const usd = (n: number) => (n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);

export default function AdminPage() {
  const { admin } = useApp();
  const [tab, setTab] = useState<Tab>("overview");
  const [hideTest, setHideTest] = useState(true);
  const { data, loading, error, reload } = useApi<AdminReport>(admin ? "/api/admin/overview" : null);
  if (!admin) return <Page><p className="muted">This page is for the business owner.</p></Page>;
  return (
    <Page wide>
      <div className="lg:hidden"><Link href="/more" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />More</Link></div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Owner dashboard</h1><p className="muted mt-1.5 text-[14.5px]">{data ? `Updated ${ago(data.generatedAt)}` : "Accounts, usage, errors and what needs fixing."}</p></div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[13.5px] muted"><input type="checkbox" checked={hideTest} onChange={(e) => setHideTest(e.target.checked)} />Hide test accounts{data ? ` (${data.kpis.testAccounts})` : ""}</label>
          <button className="btn btn-sm" onClick={reload} aria-label="Refresh"><RefreshCw size={16} />Refresh</button>
        </div>
      </div>
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={"chip shrink-0 " + (tab === k ? "is-selected" : "")} onClick={() => setTab(k)}>{l}{k === "errors" && data && data.kpis.openErrors > 0 ? ` · ${data.kpis.openErrors}` : ""}</button>)}
      </div>
      {tab === "pricing" ? <PricingTab /> : error ? <p className="muted">{error}</p> : loading && !data ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div> : data && (
        tab === "overview" ? <Overview d={data} go={setTab} /> : tab === "accounts" ? <Accounts d={data} hideTest={hideTest} /> : tab === "errors" ? <Errors d={data} reload={reload} /> : <Health d={data} />
      )}
    </Page>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "bad" | "good" }) {
  return (
    <div className="glass p-4 lg:p-5">
      <p className="faint text-[12px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="display mt-1 text-[34px] leading-none" style={tone === "bad" ? { color: "var(--danger)" } : undefined}>{value}</p>
      {sub && <p className="muted mt-1.5 text-[13px]">{sub}</p>}
    </div>
  );
}

function Bars({ data, label }: { data: { day: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div role="img" aria-label={label}>
      <div className="flex h-24 items-end gap-[3px]">
        {data.map((d) => <div key={d.day} title={`${d.day}: ${d.n}`} className="flex-1 rounded-t" style={{ height: `${Math.max(d.n ? 8 : 2, (d.n / max) * 100)}%`, background: d.n ? "linear-gradient(180deg,var(--accent),var(--accent-2))" : "var(--line)", opacity: d.n ? 1 : 0.6 }} />)}
      </div>
      <div className="faint mt-1.5 flex justify-between text-[11.5px]"><span>{data[0]?.day.slice(5)}</span><span>peak {max}</span><span>{data[data.length - 1]?.day.slice(5)}</span></div>
    </div>
  );
}

function Overview({ d, go }: { d: AdminReport; go: (t: Tab) => void }) {
  const k = d.kpis;
  const top = d.funnel[0]?.n || 1;
  return (
    <div className="space-y-6">
      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <Stat label="Accounts" value={k.accounts} sub={`+${k.signups7d} this week · +${k.signups24h} today`} />
          <Stat label="Active (7d)" value={k.active7d} sub={`${k.active24h} today · ${k.active30d} in 30d`} />
          <Stat label="Messages (7d)" value={k.messages7d} sub="sent to Mila" />
          <Stat label="AI cost (30d)" value={usd(k.aiCost30d)} sub={`${k.aiCalls30d.toLocaleString()} model calls`} />
          <Stat label="Onboarded" value={`${k.accounts ? Math.round((k.onboarded / k.accounts) * 100) : 0}%`} sub={`${k.onboarded} of ${k.accounts}`} />
          <Stat label="Open errors" value={k.openErrors} sub={`${k.errors24h} in last 24h`} tone={k.openErrors ? "bad" : "good"} />
          <Stat label="Didn't understand" value={k.unhandled7d} sub="messages this week" tone={k.unhandled7d > 5 ? "bad" : undefined} />
          <Stat label="Signups (30d)" value={k.signups30d} />
        </div>
      </section>

      <section className="glass p-5">
        <p className="h2 mb-3 flex items-center gap-2"><AlertTriangle size={18} />Needs attention</p>
        {!d.attention.length ? <p className="muted flex items-center gap-2"><CheckCircle2 size={18} />Nothing needs fixing right now.</p> : (
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
            {d.attention.map((a, i) => (
              <li key={i} className="flex items-start gap-3 py-3">
                <Pill tone={a.severity === "high" ? "danger" : a.severity === "medium" ? "warn" : "neutral"}>{a.severity}</Pill>
                <div className="min-w-0 flex-1"><p className="font-semibold leading-snug">{a.title}</p><p className="muted text-[13.5px]">{a.detail}</p></div>
                {a.tab && <button className="btn btn-quiet btn-sm shrink-0" onClick={() => go(a.tab as Tab)}>Open</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass p-5"><p className="h2 mb-3">Signups · last 30 days</p><Bars data={d.signups} label="Signups per day" /></section>
        <section className="glass p-5"><p className="h2 mb-3">Daily active · last 14 days</p><Bars data={d.dau} label="Active users per day" /></section>
        <section className="glass p-5">
          <p className="h2 mb-3">Where people drop off</p>
          <ul className="space-y-2.5">{d.funnel.map((f, i) => (
            <li key={f.step}>
              <div className="mb-1 flex justify-between text-[14px]"><span>{f.step}</span><span className="muted">{f.n}{i > 0 && d.funnel[i - 1].n ? ` · ${Math.round((f.n / d.funnel[i - 1].n) * 100)}% of previous` : ""}</span></div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--line)" }}><div className="h-full rounded-full" style={{ width: `${(f.n / top) * 100}%`, background: "linear-gradient(90deg,var(--accent),var(--accent-2))" }} /></div>
            </li>))}
          </ul>
        </section>
        <section className="glass p-5">
          <p className="h2 mb-3">What people actually use</p>
          <ul className="space-y-2.5">{d.adoption.map((f) => (
            <li key={f.feature}>
              <div className="mb-1 flex justify-between text-[14px]"><span>{f.feature}</span><span className="muted">{f.users} of {k.accounts}</span></div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--line)" }}><div className="h-full rounded-full" style={{ width: `${(f.users / Math.max(1, k.accounts)) * 100}%`, background: "var(--accent)" }} /></div>
            </li>))}
          </ul>
        </section>
      </div>

      {!!d.models.length && (
        <section className="glass p-5">
          <p className="h2 mb-3">AI usage by model · 30 days</p>
          <table className="w-full text-left text-[14.5px]"><thead className="faint text-[12.5px] uppercase tracking-wider"><tr><th className="pb-2">Model</th><th className="pb-2 text-right">Calls</th><th className="pb-2 text-right">Est. cost</th></tr></thead>
            <tbody className="divide-y" style={{ borderColor: "var(--line)" }}>{d.models.map((m) => <tr key={m.model}><td className="py-2">{m.model}</td><td className="py-2 text-right">{m.calls.toLocaleString()}</td><td className="py-2 text-right">{usd(m.costUsd)}</td></tr>)}</tbody></table>
        </section>
      )}
    </div>
  );
}

function Accounts({ d, hideTest }: { d: AdminReport; hideTest: boolean }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "active" | "messages" | "errors">("new");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const r = d.accounts.filter((a) => (!hideTest || !a.test) && (!t || `${a.name} ${a.email} ${a.brokerage ?? ""} ${a.location ?? ""}`.toLowerCase().includes(t)));
    return r.sort((a, b) => sort === "new" ? b.created_at.localeCompare(a.created_at) : sort === "active" ? (b.last_active ?? "").localeCompare(a.last_active ?? "") : sort === "messages" ? b.messages - a.messages : b.errors7d + b.unhandled7d - (a.errors7d + a.unhandled7d));
  }, [d, q, sort, hideTest]);
  return (
    <section className="glass p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1"><Search size={16} className="faint absolute left-3 top-1/2 -translate-y-1/2" /><input className="field !pl-9" placeholder="Search name, email, brokerage, city…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="field !w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort"><option value="new">Newest first</option><option value="active">Recently active</option><option value="messages">Most messages</option><option value="errors">Most problems</option></select>
        <span className="muted text-[13.5px]">{rows.length} account{rows.length === 1 ? "" : "s"}</span>
      </div>
      {!rows.length ? <p className="muted py-8 text-center">No accounts yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[14px]">
            <thead className="faint text-[12px] uppercase tracking-wider"><tr><th className="pb-2">Account</th><th className="pb-2">Joined</th><th className="pb-2">Last active</th><th className="pb-2 text-right">Msgs</th><th className="pb-2 text-right">Contacts</th><th className="pb-2 text-right">Listings</th><th className="pb-2 text-right">Events</th><th className="pb-2 text-right">Posts</th><th className="pb-2 text-right">Credits</th><th className="pb-2 pl-3">Status</th></tr></thead>
            <tbody className="divide-y" style={{ borderColor: "var(--line)" }}>
              {rows.map((a) => (
                <tr key={a.id} className="cursor-pointer align-top hover:bg-[var(--line)]/30" onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <td className="py-2.5 pr-3"><b>{a.name}</b>{a.test && <span className="faint"> · test</span>}<br /><span className="faint text-[12.5px]">{a.email}</span>
                    {open === a.id && <div className="muted mt-2 text-[13px]"><p>{[a.brokerage, a.location].filter(Boolean).join(" · ") || "No brokerage or location set"}</p><p>Tasks: {a.tasks} · Errors this week: {a.errors7d} · Not understood: {a.unhandled7d}</p><p className="faint">ID {a.id}</p></div>}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{new Date(a.created_at).toLocaleDateString()}<br /><span className="faint text-[12.5px]">{ago(a.created_at)}</span></td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{ago(a.last_active)}</td>
                  <td className="py-2.5 text-right">{a.messages}</td><td className="py-2.5 text-right">{a.contacts}</td><td className="py-2.5 text-right">{a.properties}</td><td className="py-2.5 text-right">{a.events}</td><td className="py-2.5 text-right">{a.posts}</td><td className="py-2.5 text-right">{a.credits_used}</td>
                  <td className="py-2.5 pl-3 whitespace-nowrap">{!a.onboarded ? <Pill tone="warn">Not onboarded</Pill> : a.errors7d ? <Pill tone="danger">{a.errors7d} error{a.errors7d === 1 ? "" : "s"}</Pill> : a.messages === 0 ? <Pill tone="warn">Never used</Pill> : a.unhandled7d ? <Pill tone="warn">{a.unhandled7d} missed</Pill> : <Pill tone="ok">Good</Pill>}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Errors({ d, reload }: { d: AdminReport; reload: () => void }) {
  const { toast } = useApp();
  const [show, setShow] = useState<"open" | "all">("open");
  const [open, setOpen] = useState<string | null>(null);
  const list = d.errors.filter((e) => show === "all" || e.status === "open");
  async function setStatus(ids: string[], status: "open" | "resolved") { try { await jfetch("/api/admin/errors", { method: "POST", json: { ids, status } }); reload(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't update.", "error"); } }
  return (
    <div className="space-y-6">
      <section className="glass p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="h2">Errors</p>
          <div className="flex gap-2"><button className={"chip " + (show === "open" ? "is-selected" : "")} onClick={() => setShow("open")}>Open</button><button className={"chip " + (show === "all" ? "is-selected" : "")} onClick={() => setShow("all")}>All</button></div>
        </div>
        {!list.length ? <p className="muted flex items-center gap-2 py-4"><CheckCircle2 size={18} />No {show === "open" ? "open " : ""}errors. </p> : (
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
            {list.map((e) => (
              <li key={e.signature} className="py-3">
                <div className="flex items-start gap-3">
                  <Pill tone={e.level === "error" ? "danger" : "warn"}>{e.source}</Pill>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === e.signature ? null : e.signature)}>
                    <p className="font-semibold leading-snug break-words">{e.message}</p>
                    <p className="muted text-[13px]">{e.count}× · {e.users} user{e.users === 1 ? "" : "s"} · first {ago(e.firstSeen)} · last {ago(e.lastSeen)}{e.route ? ` · ${e.route}` : ""}</p>
                  </button>
                  <button className="btn btn-quiet btn-sm shrink-0" onClick={() => setStatus(e.ids, e.status === "open" ? "resolved" : "open")}>{e.status === "open" ? "Mark fixed" : "Reopen"}</button>
                </div>
                {open === e.signature && <div className="mt-2 rounded-xl p-3 text-[12.5px]" style={{ background: "var(--line)" }}>{e.emails.length > 0 && <p className="mb-1.5"><b>Affected:</b> {e.emails.join(", ")}</p>}{e.stack ? <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words">{e.stack}</pre> : <p className="faint">No stack trace recorded.</p>}</div>}
              </li>))}
          </ul>
        )}
      </section>

      <section className="glass p-5">
        <p className="h2 mb-1">Things Mila didn't understand</p>
        <p className="muted mb-3 text-[14px]">Real messages that hit the “I'm not sure how to do that yet” fallback in the last 30 days. Each one is a missing skill or phrasing — fix the top ones first.</p>
        {!d.unhandled.length ? <p className="muted">Nothing yet.</p> : (
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>{d.unhandled.map((u) => <li key={u.phrase} className="flex items-start justify-between gap-3 py-2.5"><span className="break-words">“{u.phrase}”</span><span className="muted shrink-0 text-[13px]">{u.count}× · {ago(u.last)}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}

function MapsCheck() {
  const [res, setRes] = useState<{ configured: boolean; checks: { name: string; ok: boolean; status: string; message: string; fix: string | null }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();
  async function run() { setBusy(true); try { setRes(await jfetch("/api/admin/diagnostics")); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't run the check.", "error"); } finally { setBusy(false); } }
  return (
    <section className="glass mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="h2">Google Maps check</p><p className="muted text-[14px]">Asks Google, with your live key, whether address search and the house photos on cards will work.</p></div><button className="btn btn-primary btn-sm" onClick={run} disabled={busy}>{busy ? "Checking…" : "Run check"}</button></div>
      {res && !res.configured && <p className="mt-3 text-[14px]">No <code>GOOGLE_MAPS_API_KEY</code> is set on this deployment.</p>}
      {res?.checks.length ? <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>{res.checks.map((c) => <li key={c.name} className="flex items-start gap-3 py-3"><span className="w-12 shrink-0"><Pill tone={c.ok ? "ok" : "danger"}>{c.ok ? "OK" : "Fix"}</Pill></span><div className="min-w-0"><p className="font-semibold">{c.name}</p>{c.ok ? <p className="muted text-[13.5px]">Working.</p> : <><p className="text-[14px]">{c.fix ?? c.message}</p><p className="faint mt-0.5 break-words text-[12.5px]">Google said: {c.status} — {c.message}</p></>}</div></li>)}</ul> : null}
    </section>
  );
}

function Health({ d }: { d: AdminReport }) {
  const h = d.health;
  const rows: [string, boolean, string][] = [
    ["Permanent database (Supabase)", h.persistent, h.persistent ? "Everything saves per login and survives deploys." : "Not configured — data is temporary."],
    ["Database schema up to date", h.schemaGaps.length === 0, h.schemaGaps.length ? `Missing: ${h.schemaGaps.join(", ")}. Run the latest supabase/migrations.` : "No missing columns detected."],
    ["AI model", !!h.ai, h.ai ? `Connected (${h.ai}).` : "No AI key — rules only."],
    ["Google (Calendar / Gmail)", h.google, h.google ? "Configured." : "Not configured."],
    ["Email sending", h.email, h.email ? "Configured." : "RESEND_API_KEY not set."],
    ["Stripe payments", h.stripe, h.stripe ? "Configured." : "Not configured — nobody can pay."],
    ["Property & listing data (RentCast)", h.propertyData, h.propertyData ? `Connected with ${h.propertyKeys} API key${h.propertyKeys === 1 ? "" : "s"} — “prep for…” and “new listings” use live data.` : "Not connected — set RENTCAST_API_KEY. Without it, house info is a web-search guess and new-listing cards are off."],
    ["Address lookup (Google Maps)", h.maps, h.maps ? "Configured." : "Not set — addresses are accepted but not verified."],
    ["Owner access locked down", h.adminEmailsSet, h.adminEmailsSet ? "ADMIN_EMAILS is set." : "Set ADMIN_EMAILS to your email."],
  ];
  return (
    <>
    <section className="glass p-5">
      <p className="h2 mb-3">System health</p>
      <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
        {rows.map(([name, okk, note]) => <li key={name} className="flex items-start gap-3 py-3"><span className="inline-flex w-10 shrink-0 justify-center"><Pill tone={okk ? "ok" : "warn"}>{okk ? "OK" : "Fix"}</Pill></span><div className="min-w-0"><p className="font-semibold">{name}</p><p className="muted text-[13.5px]">{note}</p></div></li>)}
      </ul>
      <p className="faint mt-4 text-[12.5px]">Auth: {h.auth} · Store: {h.store} · Env: {h.node || "n/a"}{h.vercel ? " · Vercel" : ""}</p>
    </section>
    <MapsCheck />
    </>
  );
}
