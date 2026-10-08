"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { jfetch } from "@/components/ui";

const CATS = [
  { v: "wrong_answer", label: "Wrong answer" },
  { v: "looks_bad", label: "Looks bad" },
  { v: "broke", label: "Something broke" },
  { v: "idea", label: "Idea / change" },
] as const;

/** Test accounts only. A small flag on every screen (and on each of Mila's replies) that sends what's wrong, where it happened, and the last messages to the fix queue. */
export function BugFlag() {
  const { tester, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<(typeof CATS)[number]["v"]>("wrong_answer");
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<{ snippet?: string; targetId?: string } | null>(null);

  useEffect(() => {
    const h = (e: Event) => { setTarget((e as CustomEvent).detail ?? null); setOpen(true); };
    window.addEventListener("mila:bug", h);
    return () => window.removeEventListener("mila:bug", h);
  }, []);

  async function send() {
    if (!note.trim()) { toast("Say what's wrong in a few words.", "error"); return; }
    setBusy(true);
    try {
      await jfetch("/api/bug", { method: "POST", json: { note, category: cat, page: window.location.pathname + window.location.search, snippet: target?.snippet, targetId: target?.targetId, device: `${window.innerWidth}x${window.innerHeight} · ${navigator.userAgent}`.slice(0, 200) } });
      toast("Thanks, we got it.", "success");
      setNote(""); setTarget(null); setOpen(false);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't send that. Try again.", "error"); }
    finally { setBusy(false); }
  }

  return (
    <>
      {tester && <button type="button" onClick={() => { setTarget(null); setOpen(true); }} aria-label="Flag a problem" className="fixed bottom-[calc(env(safe-area-inset-bottom)+96px)] right-3 z-[60] flex h-11 lg:bottom-5 lg:right-5 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold shadow-lg"
        style={{ background: "#14122b", color: "#fff" }}><span aria-hidden>🐞</span>Flag</button>}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Flag a problem">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md space-y-3 rounded-t-[28px] p-5 sm:rounded-[28px]" style={{ background: "var(--surface-strong, #fff)", color: "var(--ink, #14122b)", paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
            <p className="display text-[26px] leading-none">🐞 {tester ? "Flag a problem" : "Report a bug"}</p>
            <p className="muted text-[14px]">It goes straight to our team with the screen you were on and your last few messages, so we can see what happened.</p>
            {target?.snippet && <p className="faint line-clamp-3 rounded-2xl p-3 text-[13px]" style={{ background: "color-mix(in srgb, var(--ink, #14122b) 6%, transparent)" }}>About: “{target.snippet}”</p>}
            <div className="flex flex-wrap gap-1.5">{CATS.map((c) => <button key={c.v} type="button" onClick={() => setCat(c.v)} className="chip !min-h-[34px] !px-3 text-[13.5px]" aria-pressed={cat === c.v} style={cat === c.v ? { background: "#14122b", color: "#fff" } : undefined}>{c.label}</button>)}</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} rows={4} autoFocus className="field w-full text-[16px]" placeholder="What happened, and what should it do instead?" aria-label="What's wrong" />
            <div className="flex gap-2"><button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send"}</button><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>
  );
}
