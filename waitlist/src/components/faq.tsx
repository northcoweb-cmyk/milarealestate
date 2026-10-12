"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Sparkle } from "@phosphor-icons/react";
import { AskMila } from "@/components/ask-mila";
import { cn } from "@/lib/cn";
import { FAQ_DATA } from "@/lib/site";

const FAQ = FAQ_DATA;

const ASK = 99;
export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto w-full max-w-3xl divide-y divide-border overflow-hidden rounded-3xl border border-border bg-white">
      {FAQ.map(([q, a], i) => (
        <div key={q}>
          <h3><button className="flex min-h-[60px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-[17px] font-semibold" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? null : i)}>{q}<Plus size={20} className={cn("shrink-0 transition-transform duration-300", open === i && "rotate-45")} aria-hidden /></button></h3>
          <div id={`faq-${i}`} role="region" className={cn("grid transition-all duration-300", open === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}><div className="overflow-hidden"><p className="px-5 pb-5 text-[15.5px] leading-relaxed text-muted-foreground">{a}</p></div></div>
        </div>
      ))}
      <div>
        <h3><button className="flex min-h-[64px] w-full items-center justify-between gap-3 bg-gradient-to-r from-sky/15 via-iris/10 to-peach/20 px-5 py-4 text-left text-[17px] font-semibold" aria-expanded={open === ASK} aria-controls="faq-ask" onClick={() => setOpen(open === ASK ? null : ASK)}>
          <span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4a3bc0] ring-1 ring-black/5"><Sparkle size={20} weight="duotone" aria-hidden /></span>Still curious? Ask Mila</span>
          <Plus size={20} className={cn("shrink-0 transition-transform duration-300", open === ASK && "rotate-45")} aria-hidden />
        </button></h3>
        <div id="faq-ask" role="region" className={cn("grid transition-all duration-300", open === ASK ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}><div className="overflow-hidden"><AskMila /></div></div>
      </div>
    </div>
  );
}
