"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkle } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

type Msg = { id: number; q: string; a: string | null; error?: boolean; off?: boolean; shown: string };
const IDEAS = ["How does the free trial work?", "Does Mila send emails for me?", "What can Mila do at an open house?", "When do I get access?"];
const MAX = 200;

export function AskMila() {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [msgs, setMsgs] = useState<Msg[]>([]);
  const next = useRef(1); const box = useRef<HTMLDivElement>(null);
  const reduce = useRef(false);
  useEffect(() => { reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; }, []);

  // reveal the answer a few words at a time, so it feels like Mila is typing
  function reveal(id: number, full: string) {
    if (reduce.current) { setMsgs((m) => m.map((x) => (x.id === id ? { ...x, shown: full } : x))); return; }
    const words = full.split(" "); let i = 0;
    const t = setInterval(() => { i = Math.min(words.length, i + 2); setMsgs((m) => m.map((x) => (x.id === id ? { ...x, shown: words.slice(0, i).join(" ") } : x))); if (i >= words.length) clearInterval(t); }, 45);
  }

  async function ask(text: string) {
    const question = text.trim(); if (question.length < 3 || busy) return;
    const id = next.current++; setBusy(true); setQ("");
    setMsgs((m) => [...m.slice(-2), { id, q: question, a: null, shown: "" }]);
    setTimeout(() => box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong. Please try again.");
      setMsgs((m) => m.map((x) => (x.id === id ? { ...x, a: d.answer, off: !!d.offTopic } : x))); reveal(id, d.answer);
    } catch (e) { setMsgs((m) => m.map((x) => (x.id === id ? { ...x, a: e instanceof Error ? e.message : "Something went wrong.", error: true, shown: e instanceof Error ? e.message : "Something went wrong." } : x))); }
    setBusy(false);
  }

  return (
    <section aria-labelledby="ask-title" className="mx-auto mt-10 w-full max-w-3xl">
      <div className="relative overflow-hidden rounded-[2rem] p-px" style={{ background: "linear-gradient(135deg, rgba(143,180,255,.9), rgba(166,140,255,.9) 55%, rgba(255,201,168,.9))" }}>
        <div className="relative rounded-[calc(2rem-1px)] bg-white px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex items-center gap-3.5 sm:items-start">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky/35 via-iris/25 to-peach/40 text-[#4a3bc0] ring-1 ring-black/5"><Sparkle size={24} weight="duotone" aria-hidden /></span>
            <div>
              <h3 id="ask-title" className="display text-[28px] leading-[1.05] sm:text-[30px]">Still curious? Ask Mila.</h3>
              <p className="mt-1.5 text-[14.5px] leading-snug text-muted-foreground sm:text-[15px]"><span className="sm:hidden">Only answers questions about Mila.</span><span className="hidden sm:inline">Ask anything about Mila. This box only answers questions about Mila.</span></p>
            </div>
          </div>

          {msgs.length > 0 && (
            <div className="mt-6 space-y-4" aria-live="polite">
              {msgs.map((m) => (
                <div key={m.id} className="space-y-2.5">
                  <div className="flex justify-end"><p className="max-w-[88%] rounded-3xl rounded-br-lg bg-zinc-900 px-4 py-2.5 text-[15.5px] leading-snug text-white">{m.q}</p></div>
                  <div className="flex">
                    <div className={cn("max-w-[92%] rounded-3xl rounded-bl-lg px-4 py-3 text-[15.5px] leading-relaxed", m.error ? "bg-red-50 text-red-700" : m.off ? "bg-secondary text-foreground/80" : "bg-secondary text-foreground")}>
                      {m.a === null ? <span className="inline-flex items-center gap-1.5 py-1" aria-label="Mila is typing">{[0, 1, 2].map((i) => <i key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${i * 120}ms` }} />)}</span> : m.shown}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={box} />
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="mt-6" noValidate>
            <label htmlFor="ask-input" className="sr-only">Ask a question about Mila</label>
            <div className="flex items-center gap-2 rounded-full bg-secondary/70 p-1.5 pl-5 ring-1 ring-black/5 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-iris">
              <input id="ask-input" value={q} onChange={(e) => setQ(e.target.value.slice(0, MAX))} maxLength={MAX} placeholder="Ask about Mila…" autoComplete="off" enterKeyHint="send" className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-zinc-500" />
              <button type="submit" disabled={busy || q.trim().length < 3} aria-label="Send question" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-700 disabled:opacity-35"><ArrowUp size={20} weight="bold" aria-hidden /></button>
            </div>
            <div className="mt-2 flex items-center justify-between px-2 text-[12px] text-muted-foreground"><span>AI answers can be wrong. For anything important, email us.</span><span className={cn("tabular-nums", q.length > 170 && "text-red-600")}>{q.length > 120 ? `${q.length}/${MAX}` : ""}</span></div>
          </form>

          <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {IDEAS.map((s) => <button key={s} type="button" disabled={busy} onClick={() => void ask(s)} className="shrink-0 whitespace-nowrap rounded-full border border-border bg-white px-3.5 py-2.5 text-[13.5px] font-medium text-foreground/80 transition hover:border-iris/60 hover:bg-secondary disabled:opacity-50">{s}</button>)}
          </div>
        </div>
      </div>
    </section>
  );
}
