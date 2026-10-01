"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ChevronDown, Plus, X } from "lucide-react";
import clsx from "clsx";
import type { Workflow, WorkflowRun } from "@/lib/types";
import { PageHeader, Pill, Skeleton, Toggle, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";

export default function WorkflowsPage() {
  const { data, loading, reload } = useApi<{ workflows: Workflow[]; runs: WorkflowRun[] }>("/api/workflows");
  const { toast } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Workflow["steps"]>>({});
  async function save(w: Workflow, patch: Partial<Workflow>) {
    try { await jfetch(`/api/workflows/${w.id}`, { method: "PATCH", json: patch }); reload(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save.", "error"); }
  }
  return (
    <Page>
      <Link href="/more" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />More</Link>
      <PageHeader title="Workflows" sub="What Mila does for each kind of request. Edit any of them to match how you work." />
      {loading && !data ? <Skeleton className="h-64" /> : (
        <>
          <ul className="space-y-3">
            {data?.workflows.map((w) => {
              const steps = draft[w.id] ?? w.steps; const isOpen = open === w.id;
              return (
                <li key={w.id} className={clsx("glass overflow-hidden", !w.enabled && "opacity-60")} style={{ borderRadius: 24 }}>
                  <div className="flex items-center gap-3 p-4 sm:p-5">
                    <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(isOpen ? null : w.id)} aria-expanded={isOpen}><div className="min-w-0 flex-1"><p className="font-semibold">{w.name}</p><p className="muted truncate text-[14px]">{w.description}</p></div><ChevronDown size={18} className={clsx("shrink-0 transition", isOpen && "rotate-180")} /></button>
                    <Toggle label={`Enable ${w.name}`} checked={w.enabled} onChange={(v) => save(w, { enabled: v })} />
                  </div>
                  {isOpen && (
                    <div className="hairline px-4 pb-5 pt-4 sm:px-5">
                      <ol className="space-y-2">{steps.map((s, i) => (
                        <li key={i} className="flex items-center gap-2"><span className="faint w-5 text-[13px]">{i + 1}</span>
                          <input className="field !min-h-[40px] !py-2" value={s.label} onChange={(e) => setDraft({ ...draft, [w.id]: steps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} aria-label={`Step ${i + 1}`} />
                          <button className="btn btn-quiet btn-sm !px-2" onClick={() => setDraft({ ...draft, [w.id]: steps.filter((_, j) => j !== i) })} aria-label="Remove step"><X size={16} /></button></li>))}</ol>
                      <div className="mt-3 flex flex-wrap gap-2"><button className="btn btn-sm" onClick={() => setDraft({ ...draft, [w.id]: [...steps, { tool: "create_task", label: "New step", optional: false }] })}><Plus size={15} />Add step</button>{draft[w.id] && <><button className="btn btn-primary btn-sm" onClick={() => { save(w, { steps: draft[w.id] }); setDraft((d) => { const n = { ...d }; delete n[w.id]; return n; }); toast("Workflow saved.", "success"); }}>Save</button><button className="btn btn-quiet btn-sm" onClick={() => setDraft((d) => { const n = { ...d }; delete n[w.id]; return n; })}>Discard</button></>}</div>
                      <p className="faint mt-3 text-[12.5px]">Steps Mila can run on her own (calendar, contacts, reminders, drafts) do so; others become checklist tasks so nothing is skipped.</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {!!data?.runs.length && (
            <section className="mt-9"><p className="kicker mb-3">Recent runs</p>
              <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>{data.runs.map((r) => <li key={r.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.title}</p><p className="faint text-[13px]">{r.workflow_key.replace(/_/g, " ")} · {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p></div><Pill tone={r.status === "completed" ? "ok" : r.status === "failed" ? "danger" : "warn"}>{r.status.replace("_", " ")}</Pill></li>)}</ul>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
