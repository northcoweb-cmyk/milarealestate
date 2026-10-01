"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { AppConfig } from "@/lib/types";
import { PageHeader, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";

interface Row { user: string; email: string; credits_used: number; ai_cost_usd: number; revenue_usd: number; ai_cost_pct_of_revenue: number | null; operations: number }

export default function AdminPage() {
  const { admin, toast } = useApp();
  const cfg = useApi<{ config: AppConfig }>(admin ? "/api/admin/config" : null);
  const margins = useApi<{ rows: Row[] }>(admin ? "/api/admin/margins" : null);
  const [c, setC] = useState<AppConfig | null>(null);
  useEffect(() => { if (cfg.data) setC(structuredClone(cfg.data.config)); }, [cfg.data]);
  if (!admin) return <Page><p className="muted">This page is for the business owner.</p></Page>;
  async function save() { try { await jfetch("/api/admin/config", { method: "PUT", json: { config: c } }); toast("Saved. Changes apply immediately.", "success"); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save.", "error"); } }
  const tot = margins.data?.rows.reduce((a, r) => ({ cost: a.cost + r.ai_cost_usd, credits: a.credits + r.credits_used }), { cost: 0, credits: 0 });
  return (
    <Page wide>
      <Link href="/more" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />More</Link>
      <PageHeader title="Owner dashboard" sub="Pricing and credit economics live here — not in code." />
      <section className="glass mb-6 overflow-x-auto p-5">
        <p className="h2 mb-1">Margins by user</p><p className="muted mb-4 text-[14px]">Real AI cost (from the usage ledger) against credits charged and revenue.</p>
        {margins.loading ? <Skeleton className="h-24" /> : (
          <table className="w-full min-w-[560px] text-left text-[14.5px]"><thead className="faint text-[12.5px] uppercase tracking-wider"><tr><th className="pb-2">User</th><th className="pb-2 text-right">Credits used</th><th className="pb-2 text-right">AI cost</th><th className="pb-2 text-right">Revenue</th><th className="pb-2 text-right">AI cost / revenue</th></tr></thead>
            <tbody className="divide-y" style={{ borderColor: "var(--line)" }}>{margins.data?.rows.map((r) => <tr key={r.email}><td className="py-2.5"><b>{r.user}</b><br /><span className="faint text-[12.5px]">{r.email}</span></td><td className="py-2.5 text-right">{r.credits_used.toLocaleString()}</td><td className="py-2.5 text-right">${r.ai_cost_usd.toFixed(2)}</td><td className="py-2.5 text-right">${r.revenue_usd}</td><td className="py-2.5 text-right">{r.ai_cost_pct_of_revenue == null ? "—" : `${r.ai_cost_pct_of_revenue}%`}</td></tr>)}</tbody>
            {tot && <tfoot><tr className="font-semibold"><td className="pt-3">Total</td><td className="pt-3 text-right">{tot.credits.toLocaleString()}</td><td className="pt-3 text-right">${tot.cost.toFixed(2)}</td><td /><td /></tr></tfoot>}</table>)}
        <p className="faint mt-3 text-[12.5px]">Cost estimates use per-model prices from your environment (MILA_PRICE_*). Update them when your provider changes rates.</p>
      </section>
      {!c ? <Skeleton className="h-96" /> : (
        <>
          <section className="glass mb-6 p-5"><p className="h2 mb-4">Credit costs</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(c.credit_costs).map(([k, v]) => <div key={k}><label className="lbl">{k.replace(/_/g, " ")}</label><input className="field" type="number" min={0} step={1} value={v} onChange={(e) => setC({ ...c, credit_costs: { ...c.credit_costs, [k]: Number(e.target.value) } })} /></div>)}</div></section>
          <section className="glass mb-6 p-5"><p className="h2 mb-4">Plans</p>
            <div className="grid gap-4 sm:grid-cols-2">{c.plans.map((p, i) => <div key={p.key} className="space-y-2"><label className="lbl">{p.key} — name</label><input className="field" value={p.name} onChange={(e) => setC({ ...c, plans: c.plans.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /><div className="grid grid-cols-2 gap-2"><div><label className="lbl">Price / month ($)</label><input className="field" type="number" value={p.price_usd} onChange={(e) => setC({ ...c, plans: c.plans.map((x, j) => (j === i ? { ...x, price_usd: Number(e.target.value) } : x)) })} /></div><div><label className="lbl">Credits / month</label><input className="field" type="number" value={p.credits} onChange={(e) => setC({ ...c, plans: c.plans.map((x, j) => (j === i ? { ...x, credits: Number(e.target.value) } : x)) })} /></div></div></div>)}</div></section>
          <section className="glass mb-6 p-5"><p className="h2 mb-4">Credit packs & development</p>
            <div className="grid gap-3 sm:grid-cols-3">{c.packs.map((p, i) => <div key={i} className="grid grid-cols-2 gap-2"><div><label className="lbl">Credits</label><input className="field" type="number" value={p.credits} onChange={(e) => setC({ ...c, packs: c.packs.map((x, j) => (j === i ? { ...x, credits: Number(e.target.value) } : x)) })} /></div><div><label className="lbl">Price ($)</label><input className="field" type="number" value={p.price_usd} onChange={(e) => setC({ ...c, packs: c.packs.map((x, j) => (j === i ? { ...x, price_usd: Number(e.target.value) } : x)) })} /></div></div>)}</div>
            <div className="mt-4 max-w-xs"><label className="lbl">Development credits for new accounts</label><input className="field" type="number" value={c.dev_credits} onChange={(e) => setC({ ...c, dev_credits: Number(e.target.value) })} /></div></section>
          <button className="btn btn-primary" onClick={save}>Save changes</button>
        </>
      )}
    </Page>
  );
}
