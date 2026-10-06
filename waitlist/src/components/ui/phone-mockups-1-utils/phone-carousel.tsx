"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { cn } from "@/lib/cn";

export interface ImageItem { src: string; alt: string; caption?: string }

function Phone({ image, className, priority }: { image: ImageItem; className?: string; priority?: boolean }) {
  return (
    <div className={cn("relative w-[220px] shrink-0 rounded-[2.4rem] bg-zinc-900 p-[6px] shadow-[0_24px_50px_-18px_rgba(20,10,60,.5)] ring-1 ring-white/20 sm:w-[250px]", className)}>
      <div className="relative aspect-[780/1688] w-full overflow-hidden rounded-[2rem] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt={image.alt} className="h-full w-full object-cover" draggable={false} loading={priority ? "eager" : "lazy"} />
        <div className="pointer-events-none absolute left-1/2 top-1.5 h-[14px] w-[48px] -translate-x-1/2 rounded-full bg-black" aria-hidden />
        <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-tr from-white/10 via-transparent to-transparent" aria-hidden />
      </div>
    </div>
  );
}

export function PhoneCarousel({ images, interval = 3600 }: { images: ImageItem[]; interval?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((n) => (n + 1) % images.length), interval);
    return () => clearInterval(t);
  }, [paused, images.length, interval]);
  const at = (o: number) => images[(i + o + images.length) % images.length];
  return (
    <div className="flex flex-col items-center gap-8" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative flex h-[600px] w-full items-center justify-center">
        <div className="absolute left-1/2 top-1/2 hidden -translate-x-[150%] -translate-y-1/2 scale-[.82] opacity-60 md:block"><Phone image={at(-1)} className="-rotate-6" /></div>
        <div className="absolute left-1/2 top-1/2 hidden translate-x-[50%] -translate-y-1/2 scale-[.82] opacity-60 md:block"><Phone image={at(1)} className="rotate-6" /></div>
        <div className="relative z-10" style={{ animation: "floaty 6s ease-in-out infinite", willChange: "transform" }}>
          <AnimatePresence mode="wait">
            <m.div key={i} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16, scale: 0.98 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
              <Phone image={at(0)} priority className="w-[262px] sm:w-[270px]" />
            </m.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="min-h-[52px] text-center">
        <AnimatePresence mode="wait">
          <m.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="display text-3xl text-white">{at(0).caption}</m.p>
        </AnimatePresence>
      </div>
      <div className="flex gap-2" role="tablist" aria-label="App screens">
        {images.map((im, n) => <button key={im.src} role="tab" aria-selected={n === i} aria-label={im.caption ?? im.alt} onClick={() => setI(n)} className={cn("h-2 rounded-full transition-all", n === i ? "w-8 bg-white" : "w-2 bg-white/35 hover:bg-white/60")} />)}
      </div>
    </div>
  );
}
