"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { cn } from "@/lib/cn";

export function WaitlistForm({ id, tone = "light", className }: { id: string; tone?: "light" | "dark"; className?: string }) {
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [hp, setHp] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle"); const [already, setAlready] = useState(false); const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState("");
  useEffect(() => {
    try { const q = new URLSearchParams(window.location.search); const s = q.get("src") || q.get("utm_source") || q.get("ref"); if (s) { sessionStorage.setItem("mila-src", s); } setSrc(sessionStorage.getItem("mila-src") || (document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "")); } catch { /* ignore */ }
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (state === "busy") return;
    setError(null); setState("busy");
    try {
      const r = await fetch("/api/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, name, src, website: hp }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong. Please try again.");
      setAlready(!!d.already); setState("done");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); setState("idle"); }
  }
  const dark = tone === "dark";
  if (state === "done") return (
    <div role="status" className={cn("mx-auto flex w-full max-w-xl items-start gap-3 rounded-3xl p-5 text-left", dark ? "glass-dark text-white" : "glass text-foreground", className)}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={18} /></span>
      <div><p className="text-[17px] font-semibold">{already ? "You're already on the list." : "You're on the list."}</p><p className={cn("text-[15px]", dark ? "text-white/75" : "text-muted-foreground")}>{already ? "We have your email. Watch your inbox on launch day." : "Check your inbox for a confirmation. On launch day we'll email your personal link."}</p></div>
    </div>
  );
  const field = cn("min-h-[52px] w-full rounded-2xl px-4 text-[16px] outline-none transition placeholder:opacity-60 focus-visible:ring-2 focus-visible:ring-iris", dark ? "bg-white/10 text-white ring-1 ring-white/20 placeholder:text-white" : "bg-white/80 text-foreground ring-1 ring-black/10 placeholder:text-zinc-500");
  return (
    <form onSubmit={submit} className={cn("mx-auto w-full max-w-xl", className)} noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
        <label className="sr-only" htmlFor={`${id}-name`}>First name</label>
        <input id={`${id}-name`} className={field} placeholder="First name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <label className="sr-only" htmlFor={`${id}-email`}>Email</label>
        <input id={`${id}-email`} className={field} type="email" inputMode="email" placeholder="you@brokerage.com" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
      </div>
      <div className="absolute -left-[9999px]" aria-hidden><label htmlFor={`${id}-web`}>Website</label><input id={`${id}-web`} tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></div>
      <InteractiveHoverButton type="submit" disabled={state === "busy"} text={state === "busy" ? "Joining…" : "Join the waitlist"} className={cn("mt-3 h-[54px] w-full text-[16px]", "border-black/10 text-zinc-900")} />
      {error && <p role="alert" className={cn("mt-3 text-[14.5px]", dark ? "text-red-300" : "text-red-600")}>{error}</p>}
      <p className={cn("mt-3 text-center text-[13px]", dark ? "text-white/70" : "text-white/90")}>7-day free trial at launch. No card. No spam.</p>
    </form>
  );
}
