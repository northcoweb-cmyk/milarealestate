"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, ChevronUp, Plus, Sparkles } from "lucide-react";
import type { ActionButton, Block, Message } from "@/lib/types";
import { BlockView } from "./blocks";
import { PromptInput } from "./ui/ai-chat-input";

interface Attachment { id: string; name: string; kind: string }
import { useApp } from "./app-context";
import { InstallBanner } from "./install";
import { Confirm, jfetch } from "./ui";
import { Orb } from "./orb";
import { ShowingsRail } from "./ui/property-card";
import { LiquidGlassCard } from "./ui/liquid-weather-glass";
import type { ShowingCardData } from "@/lib/showings";

export interface HomeData {
  greeting: string; firstName: string; dateLine: string;
  attention: { id: string; title: string; subtitle: string | null; reason: string | null; href: string; priority: string }[];
  events: { id: string; title: string; time: string; day: string; where: string | null }[];
  approvals: { id: string; title: string; summary: string | null }[];
  showings: ShowingCardData[];
  approvalCount: number; noticed: string[]; counts: { appointments: number; followups: number; approvals: number }; isDemo: boolean;
}

const SUGGESTIONS = [
  "I have an open house at 123 Main Street Sunday at 1 PM. Set everything up.",
  "Who do I need to follow up with today?",
  "I have a new buyer named Sarah looking for a 3 bedroom house around $650k in Montgomery County in the next 3 months.",
  "What's happening in my market right now?",
];
const SHORT = ["Set up an open house", "Who should I follow up with?", "Add a new buyer", "Market update"];

export function HomeClient({ data }: { data: HomeData }) {
  const router = useRouter();
  const { toast, setBalance, profile, capabilities } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [runSheet, setRunSheet] = useState<{ runId: string; items: { id: string; title: string; summary: string | null; risk: string }[] } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/api/messages", { cache: "no-store" }).then((r) => r.json()).then((j) => { setMessages(j.messages ?? []); setConvId(j.conversationId ?? null); }).finally(() => setLoaded(true)).catch(() => setLoaded(true));
  }, []);
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("ask");
    if (ask) { window.history.replaceState(null, "", "/"); run({ message: ask }, ask); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!chat || !el) return;
    // Read Mila's newest reply from its start; otherwise follow the conversation down.
    const last = messages[messages.length - 1];
    const target = !busy && last?.role === "mila" ? el.querySelector<HTMLElement>("[data-last-mila]") : null;
    if (target) el.scrollTo({ top: Math.max(0, target.offsetTop - el.offsetTop - 8), behavior: "smooth" });
    else el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, steps, chat, busy]);

  const run = useCallback(async (payload: { message?: string; action?: unknown; attachmentIds?: string[] }, userText?: string, files?: Attachment[]) => {
    setChat(true); setBusy(true); setSteps(["Understanding request"]);
    if (userText || files?.length) setMessages((m) => [...m, { id: "tmp-" + Date.now(), user_id: "", created_at: new Date().toISOString(), updated_at: "", conversation_id: convId ?? "", role: "user", content: userText ?? "", blocks: [], attachments: (files ?? []).map((f) => ({ ...f })) }]);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, conversationId: convId }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Mila couldn't respond.");
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.step) setSteps((s) => (s[s.length - 1] === ev.step ? s : [...s, ev.step]));
          if (ev.error) throw new Error(ev.error);
          if (ev.done) {
            setConvId(ev.done.conversationId); setBalance(ev.done.balance);
            setMessages((m) => [...m.filter((x) => !x.id.startsWith("tmp-")), ...(ev.done.userMessage ? [ev.done.userMessage] : []), ev.done.milaMessage]);
          }
        }
      }
      router.refresh();
    } catch (e) {
      setMessages((m) => m.filter((x) => !x.id.startsWith("tmp-")));
      toast(e instanceof Error ? e.message : "Mila couldn't respond. Try again.", "error");
    } finally { setBusy(false); setSteps([]); }
  }, [convId, router, toast, setBalance]);

  // Upload any attached files first, then hand the message to Mila. Returns false (keeping the draft) if the upload fails.
  const send = async (text: string, files: File[]): Promise<boolean> => {
    let docs: Attachment[] = [];
    if (files.length) {
      setBusy(true); setChat(true);
      try {
        const fd = new FormData();
        for (const f of files) fd.append("file", f);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Upload failed.");
        docs = (j.documents as { id: string; name: string; kind: string }[]).map((d) => ({ id: d.id, name: d.name, kind: d.kind }));
      } catch (e) {
        setBusy(false);
        toast(e instanceof Error ? e.message : "Upload failed.", "error");
        return false;
      }
      setBusy(false);
    }
    void run({ message: text, attachmentIds: docs.map((d) => d.id) }, text, docs);
    return true;
  };
  const onAction = async (a: NonNullable<ActionButton["action"]>) => {
    if (a.type === "prompt") return run({ message: String(a.text) }, String(a.text));
    if (a.type === "approve_run") {
      try {
        const t = await jfetch<{ approvals: { id: string; title: string; summary: string | null; risk: string; workflow_run_id: string | null }[] }>("/api/tasks");
        const items = t.approvals.filter((x) => x.workflow_run_id === a.runId);
        if (items.length) return setRunSheet({ runId: String(a.runId), items });
      } catch { /* fall through */ }
    }
    return run({ action: a });
  };
  const onApprove = (id: string) => run({ action: { type: "approve", id } });
  const onNavigate = (href: string) => router.push(href);

  async function newChat() {
    const r = await jfetch<{ conversationId: string }>("/api/messages", { method: "POST" });
    setConvId(r.conversationId); setMessages([]); setChat(false);
  }
  const hasHistory = loaded && messages.length > 0;
  const toToday = () => todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="xl:grid xl:grid-cols-[minmax(0,1fr)_410px] xl:gap-8 xl:pr-8">
      {/* ------------------------------------------------------- hero / chat */}
      <section className="relative mx-auto flex h-[100svh] w-full max-w-3xl snap-start flex-col px-4 pb-[calc(var(--nav-h)+24px)] pt-[max(env(safe-area-inset-top),20px)] lg:pb-8 xl:max-w-none xl:px-6">
        <AnimatePresence mode="wait" initial={false}>
          {!chat ? (
            <motion.div key="idle" className="flex flex-1 flex-col items-center justify-center text-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}>
              <p className="kicker mb-5">{data.dateLine}</p>
              <h1 className="display text-[clamp(44px,9vw,76px)]">{data.greeting}</h1>
              <p className="muted mt-3 text-[clamp(18px,3.4vw,24px)]">What do you need to get done?</p>
              <div className="mt-9 w-full max-w-2xl"><PromptInput onSubmit={send} disabled={busy} size="lg" placeholder="What do you need to get done?" onError={(m) => toast(m, "error")} /></div>
              <div className="no-scrollbar mt-5 flex max-w-full gap-2 overflow-x-auto px-2 pb-1">
                {SHORT.map((s, i) => <button key={s} className="chip shrink-0" onClick={() => run({ message: SUGGESTIONS[i] }, SUGGESTIONS[i])}>{s}</button>)}
              </div>
              {hasHistory && <button className="chip mt-3" onClick={() => setChat(true)}><Sparkles size={15} />Continue where we left off</button>}
              <div className="mt-6 w-full max-w-xl"><InstallBanner /></div>
            </motion.div>
          ) : (
            <motion.div key="chat" className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <div className="flex items-center justify-between pb-3">
                <p className="display text-[28px]">{data.firstName === "" ? "Mila" : "Mila"}</p>
                <div className="flex gap-2"><button className="chip" onClick={newChat}><Plus size={15} />New</button><button className="chip" onClick={() => setChat(false)}>Close</button><button className="chip xl:hidden" onClick={toToday}>Today<ChevronDown size={15} /></button></div>
              </div>
              <div ref={scroller} className="no-scrollbar -mx-2 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 pb-4" aria-live="polite">
                {messages.map((m, i) => <MessageView key={m.id} last={i === messages.length - 1} m={m} onAction={onAction} onApprove={onApprove} onNavigate={onNavigate} busy={busy} />)}
                {busy && <Thinking steps={steps} />}
              </div>
              <div className="pt-2"><PromptInput onSubmit={send} disabled={busy} placeholder="Ask Mila anything…" onError={(m) => toast(m, "error")} /></div>
            </motion.div>
          )}
        </AnimatePresence>
        {!chat && (
          <button onClick={toToday} className="absolute inset-x-0 bottom-[calc(var(--nav-h)+4px)] mx-auto flex w-fit flex-col items-center gap-0.5 text-[12px] font-semibold tracking-wide text-ink-faint xl:hidden" aria-label="See today">
            <ChevronUp size={18} className="animate-bounce" />TODAY
          </button>
        )}
      </section>

      {/* --------------------------------------------------------- today panel */}
      <aside ref={todayRef} id="today" className="mx-auto w-full max-w-3xl snap-start scroll-mt-4 px-4 pb-[calc(var(--nav-h)+40px)] pt-8 xl:sticky xl:top-0 xl:h-[100svh] xl:max-w-none xl:overflow-y-auto xl:px-0 xl:pb-10 xl:pt-10 no-scrollbar">
        <TodayPanel data={data} />
      </aside>

      <Confirm open={!!runSheet} title="Do all of this?" onClose={() => setRunSheet(null)} confirmLabel="Approve everything" onConfirm={() => { const id = runSheet!.runId; setRunSheet(null); run({ action: { type: "approve_run", runId: id } }); }}
        body={runSheet?.items.map((i) => `• ${i.title}${i.summary ? ` — ${i.summary}` : ""}`).join("\n") + (runSheet?.items.some((i) => i.risk === "high") ? "\n\nThis includes a large send, so I'm asking you to confirm it." : "")} />
      {!capabilities.ai && !profile.is_demo && null}
    </main>
  );
}

function MessageView({ m, last, onAction, onApprove, onNavigate, busy }: { m: Message; last: boolean; onAction: any; onApprove: (id: string) => void; onNavigate: (h: string) => void; busy: boolean }) {
  if (m.role === "user") {
    return (
      <div className="rise flex flex-col items-end gap-1.5">
        {m.attachments.length > 0 && <div className="flex flex-wrap justify-end gap-1.5">{m.attachments.map((a) => <span key={a.id} className="chip !min-h-[30px] text-[13px]">📎 {a.name}</span>)}</div>}
        {m.content && <div className="max-w-[88%] rounded-[24px] rounded-br-lg px-4 py-3 text-[16.5px] leading-snug" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-2))", color: "var(--accent-ink)", boxShadow: "var(--shadow)" }}>{m.content}</div>}
      </div>
    );
  }
  return (
    <div className="rise space-y-3" {...(last ? { "data-last-mila": "" } : {})}>
      {m.content && <p className="whitespace-pre-line text-[17px] leading-snug">{m.content}</p>}
      {m.blocks.map((b: Block, i: number) => <BlockView key={i} block={b} onAction={onAction} onApprove={onApprove} onNavigate={onNavigate} busy={busy} />)}
    </div>
  );
}

function Thinking({ steps }: { steps: string[] }) {
  return (
    <div className="rise flex items-center gap-3 py-1" role="status">
      <Orb />
      <div>
        <p className="text-[16px] font-semibold">Mila is working…</p>
        <AnimatePresence mode="wait"><motion.p key={steps[steps.length - 1]} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="faint text-[14px]">{steps[steps.length - 1]}</motion.p></AnimatePresence>
      </div>
    </div>
  );
}

function TodayPanel({ data }: { data: HomeData }) {
  const router = useRouter();
  const { toast } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  async function approve(id: string) {
    setBusyId(id);
    try { const r = await jfetch<{ message: string; ok: boolean }>(`/api/approvals/${id}`, { method: "POST", json: { decision: "approve" } }); toast(r.message, r.ok ? "success" : "info"); router.refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't approve that.", "error"); }
    finally { setBusyId(null); }
  }
  return (
    <div className="space-y-9">
      <section>
        <p className="kicker mb-3">Today</p>
        {data.attention.length ? (
          <>
            <h2 className="h2 mb-3">{data.attention.length === 1 ? "1 thing needs your attention" : `${data.attention.length} things need your attention`}</h2>
            <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)", borderRadius: 26 }}>
              {data.attention.map((a) => (
                <li key={a.id}><Link href={a.href} className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/30"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{a.title}</p>{a.subtitle && <p className="muted truncate text-[14.5px]">{a.subtitle}</p>}</div><ArrowRight size={18} className="shrink-0 text-ink-faint" /></Link></li>
              ))}
            </ul>
          </>
        ) : <div className="glass px-5 py-6"><p className="font-semibold">You're all caught up.</p><p className="muted text-[14.5px]">Nothing needs you right now. Tell Mila what's next.</p></div>}
      </section>

      {data.approvalCount > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between"><p className="kicker">Needs your approval</p><Link href="/tasks" className="text-[13.5px] font-semibold text-accent">See all {data.approvalCount}</Link></div>
          <div className="space-y-3">
            {data.approvals.map((a) => (
              <LiquidGlassCard key={a.id} className="p-4" borderRadius="24px" shadowIntensity="xs" glowIntensity="sm">
                <p className="font-semibold leading-tight">{a.title}</p>{a.summary && <p className="muted mt-0.5 text-[14px]">{a.summary}</p>}
                <div className="mt-3 flex gap-2"><Link className="btn btn-sm" href={`/tasks?approval=${a.id}`}>Review</Link><button className="btn btn-primary btn-sm" disabled={busyId === a.id} onClick={() => approve(a.id)}>{busyId === a.id ? "Working…" : "Approve"}</button></div>
              </LiquidGlassCard>
            ))}
          </div>
        </section>
      )}

      {data.showings.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between"><p className="kicker">Showings</p><Link href="/calendar" className="text-[13.5px] font-semibold text-accent">Calendar</Link></div>
          <ShowingsRail items={data.showings} />
          <p className="faint mt-1 px-1 text-[12.5px]">Tap a card to flip it.</p>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between"><p className="kicker">Up next</p><Link href="/calendar" className="text-[13.5px] font-semibold text-accent">Calendar</Link></div>
        {data.events.length ? (
          <ul className="space-y-1">
            {data.events.map((e) => (
              <li key={e.id} className="flex gap-4 rounded-2xl px-2 py-2.5">
                <div className="w-[72px] shrink-0 text-right"><p className="font-semibold leading-tight">{e.time}</p><p className="faint text-[12px]">{e.day}</p></div>
                <div className="min-w-0 border-l-2 pl-4" style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}><p className="truncate font-semibold leading-tight">{e.title}</p>{e.where && <p className="faint truncate text-[13.5px]">{e.where}</p>}</div>
              </li>
            ))}
          </ul>
        ) : <p className="muted px-2">Nothing scheduled in the next day and a half.</p>}
      </section>

      {data.noticed.length > 0 && (
        <section>
          <p className="kicker mb-3">Mila noticed</p>
          <ul className="space-y-2.5 px-1">{data.noticed.map((n, i) => <li key={i} className="muted text-[15px]">“{n}”</li>)}</ul>
        </section>
      )}
      {data.isDemo && <p className="faint px-1 text-[12.5px]">You're viewing fictional demo data.</p>}
    </div>
  );
}
