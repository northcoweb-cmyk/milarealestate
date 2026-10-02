"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ClipboardCheck, Plus } from "lucide-react";
import type { Property } from "@/lib/types";
import { Empty, PageHeader, Pill, Sheet, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";

interface Row { id: string; address: string; property_id: string; status: string; started_at: string; completed_at: string | null; contact: string | null; progress: { total: number; done: number; issues: number; mediaCount: number } }

export default function ShowingSheetsPage() {
  const { data, loading } = useApi<{ sheets: Row[] }>("/api/showing-sheets");
  const [picking, setPicking] = useState(false);
  const day = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
  return (
    <Page>
      <Link href="/more" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />More</Link>
      <PageHeader title="Showing sheets" sub="Check things off, add notes, photos and video during a showing." right={<button className="btn btn-primary btn-sm" onClick={() => setPicking(true)}><Plus size={16} />New</button>} />
      {loading && !data ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        : !data?.sheets.length ? <Empty title="No showing sheets yet" body="Start one when you walk a home. It lists everything worth checking and saves your notes, photos and videos." action={<button className="btn btn-primary" onClick={() => setPicking(true)}>Start a showing sheet</button>} />
        : <ul className="space-y-3">{data.sheets.map((s) => (
          <li key={s.id}><Link href={`/showings/${s.id}`} className="glass block p-4" style={{ borderRadius: 24 }}>
            <div className="flex items-start justify-between gap-3"><p className="text-[16.5px] font-semibold leading-snug">🏠 {s.address}</p><Pill tone={s.status === "complete" ? "ok" : "warn"}>{s.status === "complete" ? "Saved" : "In progress"}</Pill></div>
            <p className="faint mt-0.5 text-[13px]">{day(s.completed_at ?? s.started_at)}{s.contact ? ` · ${s.contact}` : ""}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 10%, transparent)" }}><div className="h-full rounded-full" style={{ width: `${(s.progress.done / Math.max(1, s.progress.total)) * 100}%`, background: "var(--ok)" }} /></div>
            <p className="muted mt-2 text-[13.5px]">{s.progress.done}/{s.progress.total} checked{s.progress.issues ? ` · ⚑ ${s.progress.issues} flagged` : ""}{s.progress.mediaCount ? ` · 📷 ${s.progress.mediaCount}` : ""}</p>
          </Link></li>))}</ul>}
      {picking && <PickProperty onClose={() => setPicking(false)} />}
    </Page>
  );
}

export function PickProperty({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useApp();
  const { data } = useApi<{ properties: Property[] }>("/api/properties");
  const [busy, setBusy] = useState<string | null>(null);
  async function start(pid: string) {
    setBusy(pid);
    try { const r = await jfetch<{ id: string }>("/api/showing-sheets", { method: "POST", json: { propertyId: pid } }); router.push(`/showings/${r.id}`); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't start that.", "error"); setBusy(null); }
  }
  return (
    <Sheet open onClose={onClose} title="Which home?">
      {!data ? <Skeleton className="h-24" /> : !data.properties.length ? <p className="muted">Add a property first — tell Mila about a showing or open house and she&apos;ll create it.</p>
        : <ul className="space-y-2">{data.properties.map((p) => <li key={p.id}><button disabled={!!busy} onClick={() => start(p.id)} className="glass flex w-full items-center gap-3 p-4 text-left" style={{ borderRadius: 20 }}><ClipboardCheck size={20} /><span className="min-w-0 flex-1"><span className="block font-semibold">{p.address}</span><span className="faint block text-[13px]">{[p.city, p.state].filter(Boolean).join(", ")}</span></span>{busy === p.id && <span className="faint text-[13px]">Opening…</span>}</button></li>)}</ul>}
    </Sheet>
  );
}
