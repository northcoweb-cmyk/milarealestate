"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, FileSpreadsheet, FileText, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import type { DocumentRow } from "@/lib/types";
import { Confirm, Empty, PageHeader, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";

export default function DocumentsPage() {
  const { data, loading, reload } = useApi<{ documents: DocumentRow[] }>("/api/documents");
  const { toast } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [del, setDel] = useState<DocumentRow | null>(null); const [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files?.length) return; setBusy(true);
    try { const fd = new FormData(); for (const f of Array.from(files)) fd.append("file", f); await jfetch("/api/upload", { method: "POST", body: fd }); toast("Uploaded.", "success"); reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  const Icon = ({ k }: { k: string }) => (k === "image" ? <ImageIcon size={20} /> : k === "csv" || k === "spreadsheet" ? <FileSpreadsheet size={20} /> : <FileText size={20} />);
  return (
    <Page>
      <Link href="/more" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />More</Link>
      <input ref={ref} type="file" multiple hidden accept="image/*,application/pdf,.csv,.tsv,.xlsx,.xls,.txt,.md" onChange={(e) => upload(e.target.files)} />
      <PageHeader title="Documents" sub="Files you've shared with Mila. They stay private to you." right={<button className="btn btn-primary" onClick={() => ref.current?.click()} disabled={busy}><Plus size={18} />{busy ? "Uploading…" : "Upload"}</button>} />
      {loading && !data ? <Skeleton className="h-48" /> : !data?.documents.length ? <Empty title="No documents yet" body="Upload a sign-in sheet, a buyer agreement or a spreadsheet — or attach files right in the chat." /> : (
        <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>{data.documents.map((d) => (
          <li key={d.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5"><span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}><Icon k={d.kind} /></span>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{d.name}</p><p className="faint truncate text-[13px]">{(d.size_bytes / 1024).toFixed(0)} KB · {new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{d.summary ? ` · ${d.summary}` : ""}</p></div>
            <a className="btn btn-sm" href={`/api/files/${d.id}`} target="_blank" rel="noopener noreferrer">Open</a>
            <button className="btn btn-quiet btn-sm !px-2" aria-label={`Delete ${d.name}`} onClick={() => setDel(d)}><Trash2 size={16} /></button></li>))}</ul>
      )}
      <Confirm open={!!del} danger title="Delete this document?" body={del?.name} confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={async () => { await jfetch(`/api/documents/${del!.id}?confirm=1`, { method: "DELETE" }); setDel(null); reload(); }} />
    </Page>
  );
}
