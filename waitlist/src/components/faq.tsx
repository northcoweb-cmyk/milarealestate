"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Sparkle } from "@phosphor-icons/react";
import { AskMila } from "@/components/ask-mila";
import { cn } from "@/lib/cn";

const FAQ = [
  ["What is Mila?", "Mila is an AI operations manager for real estate agents. You tell her what you need in plain English, like “set me up for my open house.” She prepares your listing, posts, emails, texts, calendar and follow-ups, and waits for your OK."],
  ["Does Mila send things for me?", "Not without you. Mila drafts everything and puts it in your approval queue. Emails and texts open in your own mail or messages app with the words already written, so you tap send. Posts are ready to copy or save to your photos."],
  ["When does it launch?", "October 20, 2026 at 10 AM Eastern. Everyone on the waitlist gets an email with a personal link that morning. Use the same email address to create your password and set up your profile."],
  ["How much does it cost?", "Every new account starts with a 7-day free trial and no card. Plans and pricing are announced at launch."],
  ["Is my data private?", "Each account's data is kept separate and visible only to you. We don't sell it, and we only use your email to send you launch updates."],
  ["Does it work on my phone?", "Yes. Mila is built phone-first and works on iPhone, Android and desktop. You can add it to your home screen so it opens like an app."],
  ["Does it connect to my CRM or MLS?", "Not yet. Mila has her own contacts, pipeline and calendar today. More integrations are on the roadmap, and waitlist members will hear about them first."],
] as const;

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
