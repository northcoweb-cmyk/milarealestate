"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronRight, Plus, Sparkles } from "lucide-react";
import type { ActionButton, Block, Message } from "@/lib/types";
import { BlockView } from "./blocks";
import { PromptInput } from "./ui/ai-chat-input";

interface Attachment { id: string; name: string; kind: string }
import { useApp } from "./app-context";
import { InstallBanner } from "./install";
import { CheckDot, Confirm, jfetch } from "./ui";
import { Orb } from "./orb";
import type { Feed } from "@/lib/feed";

export interface HomeData { greeting: string; firstName: string; dateLine: string; feed: Feed; isDemo: boolean }

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
  const [refreshKey, setRefreshKey] = useState(0);
  const [helpSeen, setHelpSeen] = useState(true);
  useEffect(() => { try { setHelpSeen(localStorage.getItem("mila.help.seen") === "1"); } catch { setHelpSeen(false); } }, []);
  const dismissHelp = () => { setHelpSeen(true); try { localStorage.setItem("mila.help.seen", "1"); } catch { /* ignore */ } };

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
    } finally { setBusy(false); setSteps([]); setRefreshKey((k) => k + 1); }
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
      <section className={"relative mx-auto flex w-full max-w-3xl flex-col px-4 pt-[max(env(safe-area-inset-top),20px)] xl:max-w-none xl:px-6 " + (chat ? "h-[100svh] pb-[calc(var(--nav-h)+24px)] lg:pb-8" : "pb-2")}>
        <AnimatePresence initial={false}>
          {!chat ? (
            <motion.div key="idle" className="flex flex-col items-center pt-6 text-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}>
              <p className="kicker mb-5">{data.dateLine}</p>
              <h1 className="display text-[clamp(38px,9vw,64px)]">{data.greeting}</h1>
              <div className="mt-6 w-full max-w-2xl"><PromptInput onSubmit={send} disabled={busy} size="lg" placeholder="What do you need to get done?" onError={(m) => toast(m, "error")} /></div>
              <div className="no-scrollbar mt-5 flex max-w-full gap-2 overflow-x-auto px-2 pb-1">
                {SHORT.map((s, i) => <button key={s} className="chip shrink-0" onClick={() => run({ message: SUGGESTIONS[i] }, SUGGESTIONS[i])}>{s}</button>)}
              </div>
              {hasHistory && <button className="chip mt-3" onClick={() => setChat(true)}><Sparkles size={15} />Continue where we left off</button>}
              {helpSeen && <div className="mt-5 w-full max-w-xl"><InstallBanner /></div>}
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
      </section>

      {/* --------------------------------------------------------- today panel */}
      <aside ref={todayRef} id="today" className="mx-auto w-full max-w-3xl scroll-mt-4 px-4 pb-[calc(var(--nav-h)+40px)] pt-7 xl:sticky xl:top-0 xl:h-[100svh] xl:max-w-none xl:overflow-y-auto xl:px-0 xl:pb-10 xl:pt-10 no-scrollbar">
        <TodayPanel data={data} refreshKey={refreshKey} helpSeen={helpSeen} onHelpSeen={dismissHelp} />
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

const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 2 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : "yesterday"; };

/** Muse-style feed: what needs you, today's plan, what Mila did, what's next — nothing else. */
function TodayPanel({ data, refreshKey, helpSeen, onHelpSeen }: { data: HomeData; refreshKey: number; helpSeen: boolean; onHelpSeen: () => void }) {
  const { toast } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [f, setF] = useState<Feed>(data.feed);
  const [, tick] = useState(0);
  const refresh = useCallback(async () => {
    try { const r = await fetch("/api/feed", { cache: "no-store" }); if (r.ok) setF((await r.json()).feed); } catch { /* offline: keep what we have */ }
  }, []);
  useEffect(() => { if (refreshKey) refresh(); }, [refreshKey, refresh]);
  useEffect(() => {
    const vis = () => { if (document.visibilityState === "visible") refresh(); };
    const id = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 45_000);
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    document.addEventListener("visibilitychange", vis); window.addEventListener("focus", vis);
    return () => { clearInterval(id); clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis); };
  }, [refresh]);

  async function togglePlan(p: Feed["plan"][number]) {
    const next = !p.done;
    setF((x) => ({ ...x, plan: x.plan.map((i) => (i.id === p.id ? { ...i, done: next } : i)) })); // instant; the server records it
    try {
      if (next) await jfetch("/api/feed/complete", { method: "POST", json: { id: p.id, title: p.title, why: p.why } });
      else await jfetch(`/api/feed/complete?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    } catch (e) {
      setF((x) => ({ ...x, plan: x.plan.map((i) => (i.id === p.id ? { ...i, done: !next } : i)) }));
      toast(e instanceof Error ? e.message : "Couldn't save that.", "error");
    }
  }
  async function approve(id: string, itemId: string) {
    setBusyId(itemId);
    try { const r = await jfetch<{ message: string; ok: boolean }>(`/api/approvals/${id}`, { method: "POST", json: { decision: "approve" } }); toast(r.message, r.ok ? "success" : "info"); refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't approve that.", "error"); }
    finally { setBusyId(null); }
  }
  const Act = ({ a, primary, itemId }: { a: Feed["needsYou"][number]["primary"]; primary?: boolean; itemId: string }) =>
    a.approveId ? <button className={primary ? "btn btn-primary btn-sm" : "btn btn-quiet btn-sm"} disabled={busyId === itemId} onClick={() => approve(a.approveId!, itemId)}>{busyId === itemId ? "Working…" : a.label}</button>
      : <Link className={primary ? "btn btn-primary btn-sm" : "btn btn-quiet btn-sm"} href={a.href ?? "/tasks"}>{a.label}</Link>;
  const doneCount = f.plan.filter((p) => p.done).length;
  return (
    <div className="space-y-9">
      {!helpSeen && (
        <section className="glass p-5" style={{ borderRadius: 24 }} aria-label="How Mila works">
          <div className="flex items-start justify-between gap-3"><p className="text-[17px] font-semibold">New here? Three things to know</p><button className="btn btn-quiet btn-sm shrink-0 whitespace-nowrap !px-3" aria-label="Dismiss" onClick={onHelpSeen}>Got it</button></div>
          <ol className="mt-3 space-y-2.5 text-[15px] leading-snug">
            <li className="flex gap-3"><span aria-hidden>💬</span><span><b>Tell Mila what you need</b> in the box above — like “I have an open house Sunday at 1.”</span></li>
            <li className="flex gap-3"><span aria-hidden>✋</span><span><b>Mila never sends or deletes without your OK.</b> Anything waiting shows up under “Needs you”.</span></li>
            <li className="flex gap-3"><span aria-hidden>✅</span><span><b>Check things off</b> in “Today’s plan” and see everything you’ve finished under Completed.</span></li>
          </ol>
        </section>
      )}

      <div>
        <p className="text-[19px] leading-snug text-ink-soft">{f.summary}</p>
        <p className="faint mt-1.5 text-[12px]">Updated {ago(f.updatedAt)}</p>
      </div>

      {f.needsYou.length > 0 && (
        <section aria-labelledby="needs-you">
          <h2 id="needs-you" className="kicker mb-3">Needs you</h2>
          <ul className="space-y-3">
            {f.needsYou.map((n) => (
              <li key={n.id} className="glass p-4" style={{ borderRadius: 24 }}>
                <div className="flex items-start gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[22px]" style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)" }} aria-hidden>{n.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[16.5px] font-semibold leading-snug">{n.title}{n.tone === "urgent" && <span className="ml-2 align-middle text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--danger)" }}>Urgent</span>}</p>
                    {n.why && <p className="muted mt-0.5 text-[14px] leading-snug">{n.why}</p>}
                    <div className="mt-3 flex items-center gap-2"><Act a={n.primary} primary itemId={n.id} />{n.secondary && <Act a={n.secondary} itemId={n.id + "-s"} />}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {f.needsTotal > f.needsYou.length && <Link href="/tasks" className="mt-3 inline-block px-1 text-[14.5px] font-semibold text-accent">See all {f.needsTotal}</Link>}
        </section>
      )}

      {f.plan.length > 0 && (
        <section aria-labelledby="todays-plan">
          <div className="mb-3 flex items-baseline justify-between"><h2 id="todays-plan" className="kicker">Today&apos;s plan{f.plan.length > 0 ? ` · ${doneCount}/${f.plan.length}` : ""}</h2><Link href="/done" className="text-[13.5px] font-semibold text-accent">Completed</Link></div>
          <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)", borderRadius: 24 }}>
            {f.plan.map((p) => (
              <motion.li key={p.id} layout="position" className="flex items-start gap-3.5 px-4 py-3.5">
                <CheckDot done={p.done} onClick={() => togglePlan(p)} label={p.done ? `Mark “${p.title}” not done` : `Mark “${p.title}” done`} />
                <motion.div className="min-w-0 flex-1" animate={{ opacity: p.done ? 0.5 : 1 }}>
                  <p className="text-[16px] font-semibold leading-snug"><span aria-hidden>{p.emoji} </span><span className="relative inline">{p.title}{p.done && <motion.span className="absolute left-0 right-0 top-1/2 h-[2px] origin-left" style={{ background: "var(--ink)" }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.25 }} />}</span></p>
                  <p className="muted text-[13.5px] leading-snug">{p.why}</p>
                </motion.div>
                {!p.done && <Link href={p.action.href ?? "/"} className="btn btn-quiet btn-sm shrink-0">{p.action.label}</Link>}
              </motion.li>
            ))}
          </ul>
        </section>
      )}

      {f.did.length > 0 && (
        <section aria-labelledby="mila-did">
          <div className="mb-3 flex items-baseline justify-between"><h2 id="mila-did" className="kicker">Mila did</h2><Link href="/done" className="text-[13.5px] font-semibold text-accent">All completed</Link></div>
          <ul className="space-y-3.5">
            {f.did.map((d) => (
              <li key={d.id} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[16px]" style={{ background: "color-mix(in srgb, var(--ok) 16%, transparent)" }} aria-hidden>{d.emoji}</span>
                <div className="min-w-0 flex-1"><p className="text-[15.5px] leading-snug">{d.href ? <Link href={d.href}>{d.text}</Link> : d.text}</p><p className="faint text-[12.5px]">✓ {ago(d.at)}</p></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {f.next.length > 0 && (
        <section aria-labelledby="coming-up">
          <div className="mb-3 flex items-baseline justify-between"><h2 id="coming-up" className="kicker">Coming up</h2><Link href="/calendar" className="text-[13.5px] font-semibold text-accent">Calendar</Link></div>
          <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)", borderRadius: 24 }}>
            {f.next.map((e) => (
              <li key={e.id}><Link href={e.href} className="flex items-center gap-3.5 px-4 py-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[22px]" style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)" }} aria-hidden>{e.emoji}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-[15.5px] font-semibold leading-tight">{e.title}</p><p className="faint truncate text-[13.5px]">{e.day} · {e.time}{e.place ? ` · ${e.place}` : ""}</p></div>
                <ChevronRight size={18} className="shrink-0 text-ink-faint" aria-hidden />
              </Link></li>
            ))}
          </ul>
        </section>
      )}
      {data.isDemo && <p className="faint px-1 text-[12.5px]">You&apos;re viewing fictional demo data.</p>}
    </div>
  );
}
