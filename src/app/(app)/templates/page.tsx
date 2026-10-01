"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import type { DocumentTemplate, TemplateKind } from "@/lib/types";
import { Confirm, Empty, PageHeader, Pill, Sheet, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";

const KINDS: [TemplateKind, string][] = [["buyer_document", "Buyer document"], ["seller_document", "Seller document"], ["follow_up", "Follow-up"], ["email", "Email"], ["social", "Social"], ["open_house", "Open house"], ["checklist", "Checklist"]];

export default function TemplatesPage() {
  const { data, loading, reload } = useApi<{ templates: DocumentTemplate[] }>("/api/templates");
  const { toast } = useApp();
  const [f, setF] = useState<{ name: string; kind: TemplateKind; body: string; is_default: boolean } | null>(null);
  const [del, setDel] = useState<DocumentTemplate | null>(null);
  return (
    <Page>
      <Link href="/more" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />More</Link>
      <PageHeader title="Templates" sub="Upload your own forms and wording. Mila only fills in {{VARIABLES}} — she never rewrites legal language." right={<button className="btn btn-primary" onClick={() => setF({ name: "", kind: "buyer_document", body: "", is_default: false })}><Plus size={18} />New</button>} />
      {loading && !data ? <Skeleton className="h-48" /> : !data?.templates.length ? <Empty title="No templates yet" body="Add your buyer agreement, listing paperwork, follow-up emails or checklists. Use {{CLIENT_NAME}}, {{DATE}}, {{PROPERTY_ADDRESS}} where details change." /> : (
        <ul className="space-y-3">{data.templates.map((t) => (
          <li key={t.id} className="glass p-4 sm:p-5" style={{ borderRadius: 24 }}>
            <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{t.name}</p><Pill tone="accent">{KINDS.find((k) => k[0] === t.kind)?.[1]}</Pill>{t.is_default && <Pill tone="ok">Default</Pill>}</div>
              <p className="faint mt-1 text-[13px]">{t.variables.length ? `Fills: ${t.variables.map((v) => `{{${v}}}`).join(" ")}` : "No variables"}</p></div>
              <button className="btn btn-sm" onClick={() => setF({ ...t })}>Edit</button><button className="btn btn-quiet btn-sm !px-2" aria-label="Delete" onClick={() => setDel(t)}><Trash2 size={16} /></button></div>
            <pre className="muted mt-3 max-h-24 overflow-hidden whitespace-pre-wrap text-[13px]">{t.body.slice(0, 260)}</pre>
          </li>))}</ul>
      )}
      <Sheet open={!!f} onClose={() => setF(null)} title="Template" wide>
        {f && <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); try { const existing = data?.templates.find((t) => t.name === f.name && "id" in f); void existing; await jfetch((f as any).id ? `/api/templates/${(f as any).id}` : "/api/templates", { method: (f as any).id ? "PATCH" : "POST", json: f }); setF(null); reload(); toast("Saved.", "success"); } catch (er) { toast(er instanceof Error ? er.message : "Couldn't save.", "error"); } }}>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className="lbl">Name</label><input className="field" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div><div><label className="lbl">Type</label><select className="field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as TemplateKind })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
          <div><label className="lbl">Text</label><textarea className="field min-h-[260px] font-mono text-[14px]" required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder={"Client: {{CLIENT_NAME}}\nDate: {{DATE}}\nProperty: {{PROPERTY_ADDRESS}}"} /><p className="faint mt-1 text-[12.5px]">Known fields: CLIENT_NAME, CLIENT_EMAIL, CLIENT_PHONE, DATE, PROPERTY_ADDRESS, AGENT_NAME, BROKERAGE. Anything else is left visible for you to complete.</p></div>
          <label className="flex items-center gap-3 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={f.is_default} onChange={(e) => setF({ ...f, is_default: e.target.checked })} />Use as my default for this type</label>
          <button className="btn btn-primary w-full">Save template</button>
        </form>}
      </Sheet>
      <Confirm open={!!del} danger title="Delete template?" body={del?.name} confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={async () => { await jfetch(`/api/templates/${del!.id}?confirm=1`, { method: "DELETE" }); setDel(null); reload(); }} />
    </Page>
  );
}
