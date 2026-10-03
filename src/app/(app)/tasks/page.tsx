"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { taskEmoji, approvalEmoji } from "@/lib/emoji";
import clsx from "clsx";
import type { Approval, Task, TaskKind, TaskPriority } from "@/lib/types";
import { CheckDot, Empty, PageHeader, Pill, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { ReviewSheet } from "@/components/review-sheet";

interface Data { open: Task[]; done: Task[]; approvals: Approval[]; contacts: Record<string, { name: string; color: string }> }
const PRI: { key: TaskPriority; label: string; dot: string }[] = [{ key: "urgent", label: "Urgent", dot: "var(--danger)" }, { key: "important", label: "Important", dot: "var(--warn)" }, { key: "upcoming", label: "Upcoming", dot: "var(--accent)" }, { key: "low", label: "Low priority", dot: "var(--ink-faint)" }];
const KINDS: { v: TaskKind | "all"; l: string }[] = [{ v: "all", l: "All" }, { v: "approval", l: "Approvals" }, { v: "follow_up", l: "Follow-ups" }, { v: "reminder", l: "Reminders" }, { v: "task", l: "Tasks" }, { v: "event", l: "Events" }, { v: "document", l: "Documents" }, { v: "communication", l: "Communication" }];

function TasksInner() {
  const { data, loading, reload } = useApi<Data>("/api/tasks");
  const params = useSearchParams();
  const { toast } = useApp();
  const [kind, setKind] = useState<TaskKind | "all">("all");
  const [review, setReview] = useState<string | null>(null);
  const [fading, setFading] = useState<string[]>([]);
  useEffect(() => { const a = params.get("approval"); if (a) setReview(a); }, [params]);

  const approvals = useMemo(() => (data?.approvals ?? []), [data]);
  const open = useMemo(() => (data?.open ?? []).filter((t) => (kind === "all" || t.kind === kind)), [data, kind]);
  const apTask = (a: Approval) => data?.open.find((t) => t.approval_id === a.id);

  async function complete(t: Task, dismiss = false) {
    if (!dismiss) { setFading((f) => [...f, t.id]); await new Promise((r) => setTimeout(r, 650)); } // let the check finish drawing before the row leaves
    try { await jfetch(`/api/tasks/${t.id}`, { method: "PATCH", json: { dismiss } }); await reload(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't update.", "error"); }
    finally { setFading((f) => f.filter((x) => x !== t.id)); }
  }
  async function quickApprove(a: Approval) {
    try { const r = await jfetch<{ message: string; ok: boolean }>(`/api/approvals/${a.id}`, { method: "POST", json: { decision: "approve" } }); toast(r.message, r.ok ? "success" : "info"); reload(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't approve.", "error"); }
  }

  const waiting = approvals.filter((a) => a.status === "pending");
  const blocked = approvals.filter((a) => a.status === "approved" && a.blocked_integration);
  return (
    <Page>
      <PageHeader title="Tasks" sub={waiting.length ? `${waiting.length} waiting for your approval` : "Everything Mila is handling or needs from you"} />
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">{KINDS.map((k) => <button key={k.v} className="chip shrink-0" style={kind === k.v ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined} onClick={() => setKind(k.v)}>{k.l}</button>)}</div>
      {loading && !data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div> : (
        <>
          {(kind === "all" || kind === "approval") && waiting.length > 0 && (
            <section className="mb-8"><p className="kicker mb-3">Needs approval</p>
              <div className="space-y-3">
                {waiting.map((a) => (
                  <div key={a.id} className="glass-strong p-5" style={{ borderRadius: 26 }}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[17px] font-semibold leading-tight"><span aria-hidden>{approvalEmoji(a.action)} </span>{a.title}</p>{a.summary && <p className="muted mt-0.5 text-[14.5px]">{a.summary}</p>}</div>{a.risk === "high" && <Pill tone="warn">Needs confirmation</Pill>}</div>
                    <div className="mt-4 flex gap-2.5"><button className="btn btn-sm" onClick={() => setReview(a.id)}>Review</button><button className="btn btn-primary btn-sm" onClick={() => a.risk === "high" ? setReview(a.id) : quickApprove(a)}>{labelFor(a)}</button></div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {blocked.length > 0 && (kind === "all" || kind === "approval") && (
            <section className="mb-8"><p className="kicker mb-3">Approved — waiting on a connection</p>
              <div className="space-y-3">{blocked.map((a) => <div key={a.id} className="glass p-4" style={{ borderRadius: 24 }}><p className="font-semibold">{a.title}</p><p className="muted text-[14.5px]">{a.error}</p><div className="mt-3 flex gap-2.5">{a.blocked_integration === "google" && <Link href="/settings/connections" className="btn btn-primary btn-sm">Connect Google</Link>}<button className="btn btn-sm" onClick={() => setReview(a.id)}>View</button></div></div>)}</div>
            </section>
          )}
          {PRI.map((p) => {
            const items = open.filter((t) => t.priority === p.key && t.kind !== "approval");
            if (!items.length) return null;
            return (
              <section key={p.key} className="mb-7"><p className="kicker mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: p.dot }} />{p.label}</p>
                <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)", borderRadius: 26 }}>
                  <AnimatePresence initial={false}>{items.map((t) => (
                    <motion.li key={t.id} layout="position" exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="flex items-start gap-3.5 overflow-hidden px-4 py-3.5">
                      <CheckDot done={fading.includes(t.id)} onClick={() => complete(t)} label={`Mark ${t.title} done`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug"><span aria-hidden>{taskEmoji(t.kind)} </span>{t.contact_id && data?.contacts[t.contact_id] ? <Link href={`/contacts/${t.contact_id}`} className="hover:underline">{data.contacts[t.contact_id].name}</Link> : null}{t.contact_id && data?.contacts[t.contact_id] ? " · " : ""}{t.title}</p>
                        {t.subtitle && <p className="muted text-[14px]">{t.subtitle}</p>}
                        <p className="faint mt-0.5 text-[12.5px]">{[t.kind.replace("_", " "), t.due_at && `due ${new Date(t.due_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`, t.priority_reason].filter(Boolean).join(" · ")}</p>
                      </div>
                      <button className="btn btn-quiet btn-sm !px-2 text-[13px]" onClick={() => complete(t, true)}>Dismiss</button>
                    </motion.li>
                  ))}</AnimatePresence>
                </ul>
              </section>
            );
          })}
          {!waiting.length && !blocked.length && !open.filter((t) => t.kind !== "approval").length && <Empty title="You're all caught up" body="When Mila prepares something for you, or notices someone to follow up with, it shows up here." />}
          {(data?.done.length ?? 0) > 0 && <Link href="/done" className="btn btn-quiet btn-sm mt-6">See completed ({data!.done.length}) →</Link>}
        </>
      )}
      <ReviewSheet approvalId={review} onClose={() => setReview(null)} onChanged={reload} />
    </Page>
  );
  void apTask;
}

function labelFor(a: Approval) {
  return { send_email: "Approve & send", send_bulk_email: "Approve & send", send_sms: "Approve & send", publish_social: "Approve post", calendar_create: "Add to calendar", calendar_change: "Approve", calendar_cancel: "Confirm cancel", send_document: "Approve & send", delete: "Confirm delete", other: "Approve" }[a.action];
}

export default function TasksPage() { return <Suspense><TasksInner /></Suspense>; }
