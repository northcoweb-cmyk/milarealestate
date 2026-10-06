"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Floating nav: clear over the sky, frosted glass once you scroll. */
export function SiteNav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => { const on = () => setSolid(window.scrollY > 48); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-500", solid ? "px-3 pt-3" : "px-5 pt-5")}>
      <div className={cn("mx-auto flex max-w-6xl items-center justify-between rounded-full transition-all duration-500", solid ? "bg-white px-5 py-2.5 shadow-[0_10px_40px_-12px_rgba(60,30,160,.35)] ring-1 ring-black/5" : "px-1 py-1")}>
        <a href="#top" className={cn("display text-[32px] leading-none transition-colors", solid ? "text-zinc-900" : "text-white")}>Mila</a>
        <a href="#join" className={cn("rounded-full px-5 py-2.5 text-[14px] font-semibold transition", solid ? "bg-zinc-900 text-white hover:bg-zinc-700" : "glass text-zinc-900 hover:bg-white")}>Join the waitlist</a>
      </div>
    </header>
  );
}
