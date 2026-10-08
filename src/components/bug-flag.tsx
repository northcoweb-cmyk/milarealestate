"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { pinTo, useVisualViewport } from "@/components/use-visual-viewport";
import { useApp } from "@/components/app-context";
import { jfetch } from "@/components/ui";

const CATS = [
  { v: "wrong_answer", label: "Wrong answer" },
  { v: "looks_bad", label: "Looks bad" },
  { v: "broke", label: "Something broke" },
  { v: "idea", label: "Idea / change" },
] as const;

/** What was open on top of the page when the flag was tapped, e.g. " · Instagram post". */
function whereOpen(): string {
  try { const d = [...document.querySelectorAll('[role="dialog"][aria-label]:not([data-bug-flag])')].map((e) => e.getAttribute("aria-label")).filter(Boolean).pop(); return d ? ` · open: ${d}` : ""; } catch { return ""; }
}

/** Test accounts only. A small flag on every screen (and on each of Mila's replies) that sends what's wrong, where it happened, and the last messages to the fix queue. */
export function BugFlag() {
  const { tester, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<(typeof CATS)[number]["v"]>("wrong_answer");
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<{ snippet?: string; targetId?: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [cardOpen, setCardOpen] = useState(false); // a sheet, card or viewer is open underneath: shrink the flag to a small bug so it never covers a button
  const vvBox = useVisualViewport(open);
  useEffect(() => {
    if (!tester) return;
    const look = () => setCardOpen(!!document.querySelector('[role="dialog"]:not([data-bug-flag])'));
    look();
    const id = window.setInterval(look, 500);
    return () => clearInterval(id);
  }, [tester]);

  useEffect(() => {
    const h = (e: Event) => { setTarget((e as CustomEvent).detail ?? null); setOpen(true); };
    window.addEventListener("mila:bug", h);
    return () => window.removeEventListener("mila:bug", h);
  }, []);

  async function send() {
    if (!note.trim()) { toast("Say what's wrong in a few words.", "error"); return; }
    setBusy(true);
    try {
      await jfetch("/api/bug", { method: "POST", json: { note, category: cat, page: window.location.pathname + window.location.search + whereOpen(), snippet: target?.snippet, targetId: target?.targetId, device: `${window.innerWidth}x${window.innerHeight} · ${navigator.userAgent}`.slice(0, 200) } });
      toast("Thanks, we got it.", "success");
      setNote(""); setTarget(null); setOpen(false);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't send that. Try again.", "error"); }
    finally { setBusy(false); }
  }

  if (!mounted) return null;
  // rendered straight into <body> above every sheet, card, viewer and the chat, so it is always reachable and always on top
  return createPortal(
    <>
      {tester && !open && <button type="button" onClick={() => { setTarget(null); setOpen(true); }} aria-label="Flag a problem" data-no-swipe className={"fixed right-3 z-[300] flex items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold shadow-lg lg:bottom-5 lg:right-5 " + (cardOpen ? "bottom-[calc(env(safe-area-inset-bottom)+12px)] h-11 w-11" : "bottom-[calc(env(safe-area-inset-bottom)+96px)] h-11 px-3.5")}
        style={{ background: "#14122b", color: "#fff" }}><span aria-hidden>🐞</span>{!cardOpen && "Flag"}</button>}
      {open && (
        <div data-bug-flag className="fixed inset-0 z-[310] flex items-end justify-center sm:items-center" style={pinTo(vvBox)} role="dialog" aria-modal="true" aria-label="Flag a problem">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md space-y-3 rounded-t-[28px] p-5 sm:rounded-[28px]" style={{ background: "var(--surface)", color: "var(--ink)", paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
            <p className="display text-[26px] leading-none">🐞 {tester ? "Flag a problem" : "Report a bug"}</p>
            {target?.snippet ? <p className="faint line-clamp-3 rounded-2xl p-3 text-[13px]" style={{ background: "color-mix(in srgb, var(--ink) 6%, transparent)" }}>About: “{target.snippet}”</p> : <p className="muted text-[14px]">We get the screen you're on and your last few messages automatically. Just say what's wrong.</p>}
            <div className="flex flex-wrap gap-1.5">{CATS.map((c) => <button key={c.v} type="button" onClick={() => setCat(c.v)} className="chip !min-h-[34px] !px-3 text-[13.5px]" aria-pressed={cat === c.v} style={cat === c.v ? { background: "#14122b", color: "#fff" } : undefined}>{c.label}</button>)}</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }} rows={3} autoFocus className="field w-full text-[16px]" placeholder="What happened, and what should it do instead?" aria-label="What's wrong" />
            <div className="flex gap-2"><button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send"}</button><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
