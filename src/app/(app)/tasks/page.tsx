"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GripVertical, X } from "lucide-react";
import Sortable from "@/components/ui/sortable";
import { taskEmoji, approvalEmoji } from "@/lib/emoji";
import clsx from "clsx";
import type { Approval, Task, TaskKind, TaskPriority } from "@/lib/types";
import { CheckDot, Empty, PageHeader, Pill, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { ReviewSheet } from "@/components/review-sheet";

interface CatchItem { id: string; title: string; kind: TaskKind; contact_id: string | null; ago: string; why: string; ask: string }
interface Data { open: Task[]; done: Task[]; catchUp?: CatchItem[]; approvals: Approval[]; contacts: Record<string, { name: string; color: string }> }
const PRI: { key: TaskPriority; label: string; dot: string }[] = [{ key: "urgent", label: "Urgent", dot: "var(--danger)" }, { key: "important", label: "Important", dot: "var(--warn)" }, { key: "upcoming", label: "Upcoming", dot: "var(--accent)" }, { key: "low", label: "Low priority", dot: "var(--ink-faint)" }];
const KINDS: { v: TaskKind | "all"; l: string }[] = [{ v: "all", l: "All" }, { v: "approval", l: "Approvals" }, { v: "follow_up", l: "Follow-ups" }, { v: "reminder", l: "Reminders" }, { v: "task", l: "Tasks" }, { v: "event", l: "Events" }, { v: "document", l: "Documents" }, { v: "communication", l: "Communication" }];

function TasksInner() {
  const { data, loading, reload } = useApi<Data>("/api/tasks");
  const params = useSearchParams();
  const { toast } = useApp();
  const [kind, setKind] = useState<TaskKind | "all">("all");
  const [bucket, setBucket] = useState<"all" | "overdue" | "today" | "week">("all");
  const [review, setReview] = useState<string | null>(null);
  const [fading, setFading] = useState<string[]>([]);
  useEffect(() => { const a = params.get("approval"); if (a) setReview(a); }, [params]);

  const approvals = useMemo(() => (data?.approvals ?? []), [data]);
  const { profile } = useApp();
  const [nowMs] = useState(() => Date.now());
  const buckets = useMemo(() => {
    const tz = profile.timezone, day = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(d));
    const today = day(new Date(nowMs)), weekEnd = day(new Date(nowMs + 7 * 86_400_000));
    const mine = (data?.open ?? []).filter((t) => t.kind !== "approval");
    const of = (t: Task) => { if (!t.due_at) return null; const d = day(t.due_at); return d < today ? "overdue" : d === today ? "today" : d <= weekEnd ? "week" : null; };
    return { of, overdue: mine.filter((t) => of(t) === "overdue").length, today: mine.filter((t) => of(t) === "today").length, week: mine.filter((t) => of(t) === "week").length };
  }, [data, profile.timezone, nowMs]);
  const open = useMemo(() => (data?.open ?? []).filter((t) => (kind === "all" || t.kind === kind) && (bucket === "all" || buckets.of(t) === bucket)), [data, kind, bucket, buckets]);
  const showToday = kind === "all" && bucket === "all";
  const todayList = useMemo(() => (data?.open ?? []).filter((t) => t.kind !== "approval" && buckets.of(t) === "today").sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9")), [data, buckets]);
  const filtered = useMemo(() => open.filter((t) => t.kind !== "approval" && !(showToday && buckets.of(t) === "today")), [open, showToday, buckets]);
  const hourNow = useMemo(() => Number(new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, hour: "numeric", hour12: false }).format(new Date(nowMs))) % 24, [profile.timezone, nowMs]);
  const [mine, setMine] = useState<Task[]>([]);
  const sig = filtered.map((t) => t.id).join(",");
  useEffect(() => { setMine(filtered); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const canSort = kind === "all" && bucket === "all"; // arranging only makes sense on the whole list
  async function saveOrder(next: Task[]) { if (!canSort) return; try { await jfetch("/api/tasks/order", { method: "PATCH", json: { ids: next.map((t) => t.id) } }); } catch { toast("Couldn't save that order.", "error"); } }
  const apTask = (a: Approval) => data?.open.find((t) => t.approval_id === a.id);

  async function complete(t: Task, dismiss = false) {
    if (!dismiss) { setFading((f) => [...f, t.id]); await new Promise((r) => setTimeout(r, 650)); } // let the check finish drawing before the row leaves
    try { await jfetch(`/api/tasks/${t.id}`, { method: "PATCH", json: { dismiss } }); await reload(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't update.", "error"); }
    finally { setFading((f) => f.filter((x) => x !== t.id)); }
  }
  async function markDone(a: Approval) {
    try { await jfetch(`/api/approvals/${a.id}`, { method: "POST", json: { decision: "done" } }); toast("Marked as done.", "success"); reload(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't update that.", "error"); }
  }
  async function quickApprove(a: Approval) {
    try { const r = await jfetch<{ message: string; ok: boolean }>(`/api/approvals/${a.id}`, { method: "POST", json: { decision: "approve" } }); toast(r.message, r.ok ? "success" : "info"); reload(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't approve.", "error"); }
  }

  const waiting = approvals.filter((a) => a.status === "pending");
  const blocked = approvals.filter((a) => a.status === "approved" && a.blocked_integration);
  return (
    <Page>
      <PageHeader title="To-do" sub={waiting.length ? `${waiting.length} waiting for your approval` : "Everything on your plate, and what Mila is handling"} />
      {data && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="What needs you">
          {([["approvals", "Waiting on you", waiting.length, "var(--accent)"], ["overdue", "Overdue", buckets.overdue, "var(--danger)"], ["today", "Due today", buckets.today, "var(--warn)"], ["week", "This week", buckets.week, "var(--ink-soft)"]] as const).map(([k, label, n, color]) => {
            const on = k === "approvals" ? kind === "approval" && bucket === "all" : bucket === k;
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => { if (k === "approvals") { setKind(on ? "all" : "approval"); setBucket("all"); } else { setBucket(on ? "all" : k); setKind("all"); } }} className="glass p-4 text-left transition active:scale-[.98]" style={{ borderRadius: 22, ...(on ? { outline: `2px solid ${color}`, outlineOffset: -2 } : {}) }}>
                <p className="display text-[30px] leading-none" style={{ color: n ? color : undefined }}>{n}</p>
                <p className="faint mt-1.5 text-[12.5px] font-semibold uppercase tracking-wider">{label}</p>
              </button>
            );
          })}
        </div>
      )}
      {data && waiting.length + buckets.overdue + buckets.today === 0 && <p className="mb-5 rounded-2xl px-4 py-3 text-[15px] font-semibold" style={{ background: "color-mix(in srgb, var(--ok) 14%, transparent)", color: "var(--ok)" }}>✅ You're on top of everything. Nothing overdue or due today.</p>}
      {(data?.catchUp?.length ?? 0) > 0 && (
        <section className="mb-7" aria-label="Catch up">
          <p className="kicker mb-3">Catch up · these slipped</p>
          <ul className="space-y-3">{data!.catchUp!.map((c) => (
            <li key={c.id} className="glass p-4" style={{ borderRadius: 24, borderLeft: "4px solid var(--warn)" }}>
              <p className="text-[16px] font-semibold leading-snug"><span aria-hidden>{taskEmoji(c.kind)} </span>{c.title}</p>
              <p className="muted mt-0.5 text-[14px]">Due {c.ago}. {c.why.replace(/^This was due [^.]+\.\s*/, "")}</p>
              <div className="mt-3 flex flex-wrap gap-2"><Link className="btn btn-primary btn-sm" href={`/?ask=${encodeURIComponent(c.ask)}`}>Do it now with Mila</Link>
                <button className="btn btn-sm" onClick={async () => { try { await jfetch(`/api/tasks/${c.id}`, { method: "PATCH", json: { dismiss: true } }); await reload(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't update.", "error"); } }}>Not needed</button></div>
            </li>))}</ul>
        </section>
      )}
      {showToday && todayList.length > 0 && (
        <section className="mb-7" aria-label="Today">
          <p className="kicker mb-2">Today · in time order</p>
          <p className="muted mb-3 text-[14px]">{hourNow >= 16 ? "Before you wrap up: check off everything you got done today." : "Check each one off as you finish it. Anything left over moves to Catch up tomorrow."}</p>
          <ul className="glass overflow-hidden" style={{ borderRadius: 26 }}>
            {todayList.map((t) => (
              <li key={t.id} className="flex items-start gap-3 border-b px-3 py-3.5 sm:px-4" style={{ borderColor: "var(--line)" }}>
                <CheckDot done={fading.includes(t.id)} onClick={() => complete(t)} label={`Mark ${t.title} done`} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug"><span aria-hidden>{taskEmoji(t.kind)} </span>{t.title}</p>
                  {t.subtitle && <p className="muted text-[14px]">{t.subtitle}</p>}
                </div>
                {t.due_at && <span className="faint shrink-0 text-[13px] font-semibold">{new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(t.due_at))}</span>}
                <button className="btn btn-quiet btn-sm !min-w-[44px] !px-2 text-[13px]" aria-label={`Dismiss ${t.title}`} onClick={() => complete(t, true)}><X size={18} aria-hidden /></button>
              </li>))}
          </ul>
        </section>
      )}
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">{KINDS.map((k) => <button key={k.v} className="chip shrink-0" style={kind === k.v ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined} onClick={() => setKind(k.v)}>{k.l}</button>)}</div>
      {loading && !data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div> : (
        <>
          {(kind === "all" || kind === "approval") && waiting.length > 0 && (
            <section className="mb-8"><p className="kicker mb-3">Needs approval</p>
              <div className="space-y-3">
                {waiting.map((a) => (
                  <div key={a.id} className="glass-strong p-5" style={{ borderRadius: 26 }}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[17px] font-semibold leading-tight"><span aria-hidden>{approvalEmoji(a.action)} </span>{a.title}</p>{a.summary && <p className="muted mt-0.5 text-[14.5px]">{a.summary}</p>}</div>{a.risk === "high" && <Pill tone="warn">Needs confirmation</Pill>}</div>
                    <div className="mt-4 flex gap-2.5"><button className="btn btn-sm" onClick={() => setReview(a.id)}>Review</button><button className="btn btn-primary btn-sm" onClick={() => a.risk === "high" ? setReview(a.id) : quickApprove(a)}>{labelFor(a)}</button>{!a.action.startsWith("calendar") && <button className="btn btn-quiet btn-sm" onClick={() => markDone(a)}>I did this</button>}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {blocked.length > 0 && (kind === "all" || kind === "approval") && (
            <section className="mb-8"><p className="kicker mb-3">Needs one more step</p>
              <div className="space-y-3">{blocked.map((a) => <div key={a.id} className="glass p-4" style={{ borderRadius: 24 }}><p className="font-semibold">{a.title}</p><p className="muted text-[14.5px]">{a.error}</p><div className="mt-3 flex gap-2.5">{a.blocked_integration === "google" && <Link href="/settings/connections" className="btn btn-primary btn-sm">Set up</Link>}<button className="btn btn-sm" onClick={() => setReview(a.id)}>View</button></div></div>)}</div>
            </section>
          )}
          {mine.length > 0 && (
            <section className="mb-7">
              <p className="kicker mb-3 flex items-center gap-2">Your list{canSort ? <span className="faint font-normal normal-case tracking-normal">· drag ⠿ to put things in the order you want</span> : null}</p>
              <div className="glass overflow-hidden" style={{ borderColor: "var(--line)", borderRadius: 26 }}>
                <Sortable items={mine} onItemsChange={setMine} itemKey={(t) => t.id} itemLabel={(t) => t.title} label="Your to-do list" onReorder={saveOrder}>
                  {(t, handle, { dragging }) => { const pri = PRI.find((x) => x.key === t.priority)!; return (
                    <div className="flex items-start gap-3 border-b px-3 py-3.5 sm:px-4" style={{ borderColor: "var(--line)", background: dragging ? "color-mix(in srgb, var(--surface-strong, #fff) 92%, transparent)" : undefined }}>
                      {canSort ? <button type="button" className="mt-0.5 flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-white/30" {...handle}><GripVertical size={18} aria-hidden /></button> : <span className="w-1" />}
                      <CheckDot done={fading.includes(t.id)} onClick={() => complete(t)} label={`Mark ${t.title} done`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug"><span aria-hidden>{taskEmoji(t.kind)} </span>{t.contact_id && data?.contacts[t.contact_id] ? <><Link href={`/contacts/${t.contact_id}`} className="hover:underline">{data.contacts[t.contact_id].name}</Link>{" · "}</> : null}{t.title}</p>
                        {t.subtitle && <p className="muted text-[14px]">{t.subtitle}</p>}
                        <p className="faint mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]"><span className="inline-flex items-center gap-1 font-semibold"><i className="inline-block h-2 w-2 rounded-full" style={{ background: pri.dot }} />{pri.label}</span><span>{[t.kind.replace("_", " "), t.due_at && `due ${new Date(t.due_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`, t.priority_reason].filter(Boolean).join(" · ")}</span></p>
                      </div>
                      <button className="btn btn-quiet btn-sm !min-w-[44px] !px-2 text-[13px]" aria-label={`Dismiss ${t.title}`} onClick={() => complete(t, true)}><X size={18} className="sm:hidden" aria-hidden /><span className="hidden sm:inline">Dismiss</span></button>
                    </div>); }}
                </Sortable>
              </div>
            </section>
          )}
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
  return { send_email: "Approve draft", send_bulk_email: "Approve draft", send_sms: "Approve draft", publish_social: "Approve post", calendar_create: "Add to calendar", calendar_change: "Approve", calendar_cancel: "Confirm cancel", calendar_replace: "Confirm replacement", send_document: "Approve draft", delete: "Confirm delete", other: "Approve" }[a.action];
}

export default function TasksPage() { return <Suspense><TasksInner /></Suspense>; }
