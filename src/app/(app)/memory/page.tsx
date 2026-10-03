"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import type { Memory } from "@/lib/types";
import { Confirm, Empty, PageHeader, Pill, Sheet, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";

const SCOPES = [["all", "All"], ["user", "You"], ["contact", "Contacts"], ["property", "Properties"], ["business", "Business"], ["workflow", "Workflows"]] as const;

export default function MemoryPage() {
  const { data, loading, reload } = useApi<{ memories: Memory[]; subjects: Record<string, string> }>("/api/memories");
  const { toast } = useApp();
  const [scope, setScope] = useState<string>("all");
  const [edit, setEdit] = useState<Partial<Memory> | null>(null);
  const [del, setDel] = useState<Memory | null>(null);
  const list = useMemo(() => (data?.memories ?? []).filter((m) => scope === "all" || m.scope === scope).sort((a, b) => Number(b.pinned) - Number(a.pinned)), [data, scope]);
  async function save() {
    try { if (edit?.id) await jfetch(`/api/memories/${edit.id}`, { method: "PATCH", json: { key: edit.key, value: edit.value } }); else await jfetch("/api/memories", { method: "POST", json: { scope: "user", key: edit?.key, value: edit?.value } }); setEdit(null); reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save.", "error"); }
  }
  return (
    <Page>
      <Link href="/more" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />More</Link>
      <PageHeader title="Memory" sub="Durable facts Mila keeps about you, your clients and your business. You're always in control." right={<button className="btn btn-primary" onClick={() => setEdit({ key: "", value: "" })}><Plus size={18} />Add</button>} />
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">{SCOPES.map(([v, l]) => <button key={v} className="chip shrink-0" style={scope === v ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined} onClick={() => setScope(v)}>{l}</button>)}</div>
      {loading && !data ? <Skeleton className="h-48" /> : !list.length ? <Empty title="Nothing here yet" body="Tell Mila things worth remembering — “Remember that I sign emails with just my first name” — or add one yourself." /> : (
        <ul className="space-y-3">{list.map((m) => (
          <li key={m.id} className="glass flex items-start gap-3 p-4 sm:p-5" style={{ borderRadius: 24 }}>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex flex-wrap items-center gap-2"><p className="font-semibold">{m.key}</p><Pill tone="accent">{m.scope === "contact" && m.subject_id && data?.subjects[m.subject_id] ? data.subjects[m.subject_id] : m.scope}</Pill>{m.source !== "user_stated" && <Pill>{m.source === "imported" ? "From import" : "Inferred"}</Pill>}</div>
              <p className="muted whitespace-pre-line text-[14.5px]">{m.value}</p>
            </div>
            <button className="btn btn-quiet btn-sm !px-2" aria-label={m.pinned ? "Unpin" : "Pin"} onClick={() => jfetch(`/api/memories/${m.id}`, { method: "PATCH", json: { pinned: !m.pinned } }).then(reload)}><Pin size={16} style={m.pinned ? { color: "var(--accent)", fill: "var(--accent)" } : undefined} /></button>
            <button className="btn btn-quiet btn-sm !px-2" aria-label="Edit" onClick={() => setEdit(m)}><Pencil size={16} /></button>
            <button className="btn btn-quiet btn-sm !px-2" aria-label="Delete" onClick={() => setDel(m)}><Trash2 size={16} /></button>
          </li>))}</ul>
      )}
      <p className="faint mt-6 px-2 text-[13px]">Mila keeps facts in structured, durable storage — not in the chat — so important details stay put. She won't claim to remember anything that isn't saved here.</p>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit memory" : "Add memory"}>
        <div className="space-y-3"><div><label className="lbl">Title</label><input className="field" value={edit?.key ?? ""} onChange={(e) => setEdit({ ...edit, key: e.target.value })} placeholder="Email style" /></div><div><label className="lbl">What to remember</label><textarea className="field min-h-[120px]" value={edit?.value ?? ""} onChange={(e) => setEdit({ ...edit, value: e.target.value })} /></div><button className="btn btn-primary w-full" disabled={!edit?.key?.trim() || !edit?.value?.trim()} onClick={save}>Save</button></div>
      </Sheet>
      <Confirm open={!!del} danger title="Forget this?" body={del ? `Mila will no longer use “${del.key}”.` : ""} confirmLabel="Forget" onClose={() => setDel(null)} onConfirm={async () => { await jfetch(`/api/memories/${del!.id}`, { method: "DELETE" }); setDel(null); reload(); }} />
    </Page>
  );
}
