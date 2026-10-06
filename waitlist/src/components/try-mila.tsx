"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ArrowUp, Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface Card { emoji: string; label: string; title: string; detail: string; action: string }
interface Scenario { key: string; tab: string; ask: string; reply: string; cards: Card[]; brief?: { title: string; done: number; total: number; rows: string[] } }

const SCENARIOS: Scenario[] = [
  { key: "oh", tab: "Open house", ask: "Set me up for my open house at 4812 Bluebonnet Ln, Austin, Sunday at 1.", reply: "Done. I lined it all up. Nothing goes out until you approve it.",
    cards: [
      { emoji: "📅", label: "Calendar", title: "Open house · Sun 1–4 PM", detail: "4812 Bluebonnet Ln, Austin, TX", action: "Add" },
      { emoji: "📸", label: "Post", title: "3-slide Instagram carousel", detail: "Full address on the first photo, 5 hashtags", action: "Review" },
      { emoji: "✉️", label: "Email", title: "Invite to 14 past buyers", detail: "Opens in your mail app, ready to send", action: "Approve" },
      { emoji: "✅", label: "Checklist", title: "7 open house tasks", detail: "Signs, sign-in sheet, snacks, and more", action: "Start" },
    ] },
  { key: "fu", tab: "Follow-ups", ask: "Who should I follow up with today?", reply: "Three people are waiting on you. I drafted each message.",
    cards: [
      { emoji: "💬", label: "Follow-up", title: "Aisha: showing was yesterday", detail: "“Thanks for coming by. Any questions on the home?”", action: "Approve" },
      { emoji: "💬", label: "Follow-up", title: "Marcus: asked about financing", detail: "“Here are two lenders I trust. Want an intro?”", action: "Approve" },
      { emoji: "🌱", label: "New lead", title: "Dana: nobody has reached out", detail: "Short intro text, ready to send", action: "Approve" },
    ] },
  { key: "lb", tab: "Listing brief", ask: "Get me ready to list 412 Cypress Creek Rd, Wimberley.", reply: "Here's your brief. I started the checklist and drafted the announcement.",
    cards: [{ emoji: "📸", label: "Post", title: "Instagram announcement drafted", detail: "Photo, price and full address included", action: "Review" }],
    brief: { title: "Listing brief", done: 2, total: 8, rows: ["Photos pulled from the address", "Description drafted", "Still missing: HOA details, disclosures, showing hours"] } },
  { key: "mp", tab: "Meeting prep", ask: "Prep me for my 3 PM with the Hales.", reply: "You're ready. Here's what matters before you walk in.",
    cards: [
      { emoji: "🗒️", label: "Prep", title: "What they want", detail: "3 bed, under $650K, near good schools", action: "Open" },
      { emoji: "🏡", label: "Matches", title: "3 homes that fit", detail: "Two new this week, one price drop", action: "Open" },
      { emoji: "📌", label: "Remember", title: "Last time", detail: "They loved the backyard and disliked the busy road", action: "Open" },
    ] },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function TryMila() {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "thinking" | "done">("typing");
  const [shown, setShown] = useState(0);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const run = useRef(0);
  const wrap = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => { const el = wrap.current; if (!el || typeof IntersectionObserver === "undefined") { setSeen(true); return; } const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.25 }); io.observe(el); return () => io.disconnect(); }, []);
  const s = SCENARIOS[idx];

  useEffect(() => {
    if (!seen) return;
    const id = ++run.current; const alive = () => run.current === id;
    (async () => {
      setTyped(""); setPhase("typing"); setShown(0); setApproved({});
      for (let n = 2; n < s.ask.length + 2; n += 2) { if (!alive()) return; setTyped(s.ask.slice(0, n)); await sleep(30 + Math.random() * 20); }
      await sleep(250); if (!alive()) return; setPhase("thinking"); await sleep(750); if (!alive()) return; setPhase("done");
      for (let n = 1; n <= s.cards.length; n++) { await sleep(280); if (!alive()) return; setShown(n); }
    })();
    return () => { run.current++; };
  }, [idx, s, seen]);

  const allDone = phase === "done" && shown === s.cards.length && s.cards.every((c, n) => approved[`${s.key}-${n}`]);
  return (
    <div ref={wrap} className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-[220px_1fr]">
      <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible" role="tablist" aria-label="Try Mila">
        {SCENARIOS.map((x, n) => (
          <button key={x.key} role="tab" aria-selected={n === idx} onClick={() => setIdx(n)} className={cn("min-h-[48px] shrink-0 rounded-2xl px-4 py-3 text-left text-[15px] font-semibold transition", n === idx ? "bg-white text-zinc-900 shadow-lg" : "glass-dark text-white/85 hover:bg-white/10")}>{x.tab}</button>
        ))}
        <p className="hidden px-1 pt-2 text-[12.5px] leading-snug text-white/55 md:block">Example with fictional data. In the real app Mila uses your own listings, contacts and calendar.</p>
      </div>
      <div className="glass-dark relative min-h-[430px] overflow-hidden rounded-[2rem] p-4 sm:p-6" aria-live="polite">
        <div className="mb-4 flex justify-end"><div className="max-w-[88%] rounded-3xl rounded-br-lg bg-white px-4 py-3 text-[15.5px] leading-snug text-zinc-900">{typed}{phase === "typing" && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-zinc-900" />}</div></div>
        <AnimatePresence>
          {phase === "thinking" && <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-1 text-[14px] text-white/60">Mila is working…</m.p>}
          {phase === "done" && (
            <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <p className="px-1 text-[16px] leading-snug text-white">{s.reply}</p>
              {s.brief && (
                <div className="rounded-2xl bg-white p-4 text-zinc-900">
                  <div className="flex items-baseline justify-between"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-zinc-500">{s.brief.title}</p><p className="display text-3xl">{s.brief.done}<span className="text-xl text-zinc-400">/{s.brief.total}</span></p></div>
                  <div className="my-2 h-1.5 overflow-hidden rounded-full bg-zinc-200"><m.div initial={{ width: 0 }} animate={{ width: `${(s.brief.done / s.brief.total) * 100}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-zinc-900" /></div>
                  <ul className="space-y-1 text-[14px] text-zinc-700">{s.brief.rows.map((r) => <li key={r}>• {r}</li>)}</ul>
                </div>
              )}
              <div className="grid gap-2.5 sm:grid-cols-2">
                {s.cards.slice(0, shown).map((c, n) => { const k = `${s.key}-${n}`; const ok = !!approved[k]; return (
                  <m.div key={k} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35 }} className="flex items-start gap-3 rounded-2xl bg-white p-3.5 text-zinc-900">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-xl" aria-hidden>{c.emoji}</span>
                    <div className="min-w-0 flex-1"><p className="text-[10.5px] font-bold uppercase tracking-[.16em] text-zinc-500">{c.label}</p><p className="text-[15px] font-semibold leading-tight">{c.title}</p><p className="mt-0.5 text-[13px] leading-snug text-zinc-600">{c.detail}</p>
                      <button onClick={() => setApproved((a) => ({ ...a, [k]: !a[k] }))} aria-pressed={ok} className={cn("mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold transition", ok ? "bg-emerald-500 text-white" : "bg-zinc-900 text-white hover:bg-zinc-700")}>{ok ? <><Check size={15} />Done</> : c.action}</button></div>
                  </m.div>); })}
              </div>
              {allDone && <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-1 pt-1 text-[15px] font-semibold text-emerald-300">All approved. That&apos;s the whole job, in one sentence.</m.p>}
            </m.div>
          )}
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-center justify-between rounded-full bg-white/10 px-4 py-2.5 text-[14px] text-white/50 sm:inset-x-6 sm:bottom-5"><span>Ask Mila anything…</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-white"><ArrowUp size={16} /></span></div>
        <div className="h-14" aria-hidden />
      </div>
    </div>
  );
}
