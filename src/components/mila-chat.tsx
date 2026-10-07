"use client";

import { FeedbackRow } from "@/components/feedback-row";
import { keyboardUp, pinTo, useVisualViewport } from "./use-visual-viewport";
import { useScrollLock } from "./use-scroll-lock";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Sparkles, X } from "lucide-react";
import type { ActionButton, Block, Message } from "@/lib/types";
import { BlockView } from "./blocks";
import { PromptInput } from "./ui/ai-chat-input";
import { useApp } from "./app-context";
import { Confirm, jfetch } from "./ui";
import { Orb } from "./orb";

interface Attachment { id: string; name: string; kind: string }
interface MilaCtx {
  /** Send something to Mila (opens the chat). Returns false if an upload failed so the caller can keep its draft. */
  ask: (text: string, files?: File[]) => Promise<boolean>;
  open: () => void;
  isOpen: boolean;
  busy: boolean;
  hasHistory: boolean;
  /** Increments after every finished turn, so screens can refresh what Mila changed. */
  turns: number;
}
const Ctx = createContext<MilaCtx | null>(null);
export const useMila = () => { const c = useContext(Ctx); if (!c) throw new Error("useMila outside provider"); return c; };

/**
 * One Mila for the whole app: a chat sheet you can open from any tab. Buttons like "Draft message" talk to it
 * in place instead of bouncing you to another screen.
 */
export function MilaProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { toast, setBalance } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isOpen, setOpen] = useState(false);
  const vvBox = useVisualViewport(isOpen);
  useScrollLock(isOpen);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [turns, setTurns] = useState(0);
  const [runSheet, setRunSheet] = useState<{ runId: string; items: { id: string; title: string; summary: string | null; risk: string }[] } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/messages", { cache: "no-store" }).then((r) => r.json()).then((j) => { setMessages(j.messages ?? []); setConvId(j.conversationId ?? null); }).finally(() => setLoaded(true)).catch(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!isOpen) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [isOpen]);
  // When the keyboard slides in or out the visible area changes: keep the newest message in view instead of leaving it behind the keyboard.
  useEffect(() => {
    if (!isOpen) return;
    const id = setTimeout(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }), 80);
    return () => clearTimeout(id);
  }, [vvBox?.height, isOpen]);
  useEffect(() => {
    const el = scroller.current;
    if (!isOpen || !el) return;
    const last = messages[messages.length - 1];
    const target = !busy && last?.role === "mila" ? el.querySelector<HTMLElement>("[data-last-mila]") : null; // read the newest reply from its start
    if (target) el.scrollTo({ top: Math.max(0, target.offsetTop - el.offsetTop - 8), behavior: "smooth" });
    else el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, steps, isOpen, busy]);

  const run = useCallback(async (payload: { message?: string; action?: unknown; attachmentIds?: string[] }, userText?: string, files?: Attachment[]) => {
    setOpen(true); setBusy(true); setSteps(["Understanding request"]);
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
    } finally { setBusy(false); setSteps([]); setTurns((n) => n + 1); }
  }, [convId, router, toast, setBalance]);

  // Upload attachments first, then hand the message to Mila. Returns false (keeping the draft) if the upload fails.
  const ask = useCallback(async (text: string, files: File[] = []): Promise<boolean> => {
    let docs: Attachment[] = [];
    if (files.length) {
      setBusy(true); setOpen(true);
      try {
        const fd = new FormData(); for (const f of files) fd.append("file", f);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Upload failed.");
        docs = (j.documents as { id: string; name: string; kind: string }[]).map((d) => ({ id: d.id, name: d.name, kind: d.kind }));
      } catch (e) { setBusy(false); toast(e instanceof Error ? e.message : "Upload failed.", "error"); return false; }
      setBusy(false);
    }
    void run({ message: text, attachmentIds: docs.map((d) => d.id) }, text, docs);
    return true;
  }, [run, toast]);

  // Any "Ask Mila" link anywhere in the app (href="/?ask=…") opens the chat in place instead of navigating.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href^='/?ask=']") as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault(); e.stopPropagation();
      const q = new URL(a.href, location.origin).searchParams.get("ask");
      if (q) void ask(q);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [ask]);
  useEffect(() => { // deep link: /?ask=… opened from outside
    const q = new URLSearchParams(window.location.search).get("ask");
    if (q) { window.history.replaceState(null, "", window.location.pathname); void ask(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const onNavigate = (href: string) => { setOpen(false); router.push(href); };
  async function newChat() {
    const r = await jfetch<{ conversationId: string }>("/api/messages", { method: "POST" });
    setConvId(r.conversationId); setMessages([]);
  }

  const value = useMemo<MilaCtx>(() => ({ ask, open: () => setOpen(true), isOpen, busy, hasHistory: loaded && messages.length > 0, turns }), [ask, isOpen, busy, loaded, messages.length, turns]);
  const showFab = !isOpen && path !== "/" && !path.startsWith("/onboarding") && !path.startsWith("/showings/"); // the sheet has its own controls

  return (
    <Ctx.Provider value={value}>
      {children}

      <AnimatePresence>
        {showFab && (
          <motion.button key="fab" onClick={() => setOpen(true)} initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} whileTap={{ scale: 0.95 }}
            className="btn btn-primary fixed right-4 z-[45] !min-h-[48px] !px-5 shadow-lg lg:right-8" style={{ bottom: "calc(var(--nav-h) + env(safe-area-inset-bottom) - 6px)" }} aria-label="Ask Mila">
            <Sparkles size={18} />Ask Mila{busy && <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--ok)" }} />}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" style={pinTo(vvBox)} role="dialog" aria-modal="true" aria-label="Mila">
            <motion.div className="absolute inset-0 touch-none bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div className="surface relative flex h-[92svh] max-h-full w-full flex-col overflow-hidden sm:h-[86svh] sm:max-w-2xl" style={{ borderRadius: 32, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
              initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", damping: 30, stiffness: 340 }}>
              <div className="flex items-center justify-between px-5 pb-2 pt-4" style={keyboardUp(vvBox) ? { paddingTop: "max(env(safe-area-inset-top), 14px)" } : undefined}>
                <p className="display text-[28px]">Mila</p>
                <div className="flex gap-2"><button className="chip" onClick={newChat} disabled={busy}><Plus size={15} />New chat</button><button className="btn btn-quiet btn-sm !px-2" onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button></div>
              </div>
              <div ref={scroller} className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-4" aria-live="polite">
                {messages.length === 0 && !busy && <EmptyChat onPick={(t) => run({ message: t }, t)} />}
                {messages.map((m, i) => <MessageView key={m.id} last={i === messages.length - 1} m={m} onAction={onAction} onApprove={onApprove} onNavigate={onNavigate} busy={busy} />)}
                {busy && <Thinking steps={steps} />}
              </div>
              <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"><PromptInput onSubmit={(t, f) => ask(t, f)} disabled={busy} placeholder="Ask Mila anything…" onError={(m) => toast(m, "error")} /></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Confirm open={!!runSheet} title="Do all of this?" onClose={() => setRunSheet(null)} confirmLabel="Approve everything" onConfirm={() => { const id = runSheet!.runId; setRunSheet(null); run({ action: { type: "approve_run", runId: id } }); }}
        body={runSheet?.items.map((i) => `• ${i.title}${i.summary ? ` — ${i.summary}` : ""}`).join("\n") + (runSheet?.items.some((i) => i.risk === "high") ? "\n\nThis includes a large send, so I'm asking you to confirm it." : "")} />
    </Ctx.Provider>
  );
}

const TRY = [
  "I have an open house at 123 Main Street Sunday at 1 PM. Set everything up.",
  "Who do I need to follow up with today?",
  "I have a new buyer named Sarah looking for a 3 bedroom house around $650k.",
  "What's happening in my market right now?",
];
function EmptyChat({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="pt-6">
      <p className="text-[20px] font-semibold leading-snug">What do you need done?</p>
      <p className="muted mt-1 text-[15px]">Tell me in plain words. I&apos;ll do the work and ask before I send or delete anything.</p>
      <div className="mt-5 space-y-2.5">{TRY.map((t) => <button key={t} onClick={() => onPick(t)} className="glass block w-full px-4 py-3.5 text-left text-[15px] leading-snug" style={{ borderRadius: 20 }}>{t}</button>)}</div>
    </div>
  );
}

function MessageView({ m, last, onAction, onApprove, onNavigate, busy }: { m: Message; last: boolean; onAction: (a: NonNullable<ActionButton["action"]>) => unknown; onApprove: (id: string) => void; onNavigate: (h: string) => void; busy: boolean }) {
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
      {m.blocks.map((b: Block, i: number) => <BlockView key={i} block={b} onAction={onAction as never} onApprove={onApprove} onNavigate={onNavigate} busy={busy} />)}
      {!busy && (m.content || m.blocks.length > 0) && <FeedbackRow target="chat" targetId={m.id} snippet={m.content?.slice(0, 400)} />}
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
