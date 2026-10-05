"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useScrollLock } from "../use-scroll-lock";
import { motion, useMotionValue, useTransform } from "motion/react";
import { useSwipeDismiss } from "../use-swipe-dismiss";
import type { SocialPost, SocialPlatform, SocialSlide } from "@/lib/types";
import { FORMATS, formatFor } from "@/lib/content/design";
import { previewUrl, type Brand } from "@/lib/content/render";

export const PLATFORM_META: Record<SocialPlatform, { label: string; short: string; color: string }> = {
  instagram: { label: "Instagram", short: "IG", color: "#1a1a1a" },
  instagram_story: { label: "Story", short: "ST", color: "#2a2a2c" },
  facebook: { label: "Facebook", short: "FB", color: "#3a3a3c" },
  tiktok: { label: "TikTok", short: "TT", color: "#000000" },
  linkedin: { label: "LinkedIn", short: "in", color: "#555558" },
  x: { label: "X", short: "X", color: "#161618" },
};

export const STATUS_META: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "accent" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" }, pending_approval: { label: "Needs approval", tone: "warn" }, approved_unpublished: { label: "Ready to post", tone: "accent" },
  scheduled: { label: "Planned", tone: "ok" }, published: { label: "Posted", tone: "ok" }, archived: { label: "Archived", tone: "neutral" }, failed: { label: "Failed", tone: "danger" },
};

export function PlatformBadge({ platform, size = 26 }: { platform: SocialPlatform; size?: number }) {
  const m = PLATFORM_META[platform];
  return <span title={m.label} className="inline-flex shrink-0 items-center justify-center rounded-lg font-bold text-white" style={{ width: size, height: size, background: m.color, fontSize: size * 0.4, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.2)" }}>{m.short}</span>;
}

/** A rendered slide (exactly what gets exported), drawn lazily and cached. */
export function SlideImage({ slide, index, total, post, brand, width = 540, className = "", rounded = 18 }: { slide: SocialSlide; index: number; total: number; post: Pick<SocialPost, "platform" | "category">; brand: Brand; width?: number; className?: string; rounded?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const f = FORMATS[formatFor(post.platform)];
  const key = JSON.stringify([slide, index, total, post.platform, post.category, brand]);
  useEffect(() => {
    let alive = true;
    previewUrl(slide, { index, total, platform: post.platform, brand, category: post.category, width }).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width]);
  return (
    <div className={"relative overflow-hidden " + className} style={{ aspectRatio: `${f.w} / ${f.h}`, borderRadius: rounded, background: "color-mix(in srgb, var(--ink) 8%, transparent)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={slide.headline} className="absolute inset-0 h-full w-full object-cover" draggable={false} /> : <div className="shimmer absolute inset-0" />}
    </div>
  );
}

/** "2026-10-05T14:00" (wall clock in tz) <-> ISO helpers for datetime-local inputs. */
export function toLocalInput(iso: string | null, tz: string): string {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** Full-screen viewer for a post's images: tap a thumbnail to open it, swipe (or use the arrow keys) through the whole carousel. */
export function SlideViewer({ slides, start = 0, post, brand, onClose }: { slides: SocialSlide[]; start?: number; post: Pick<SocialPost, "platform" | "category">; brand: Brand; onClose: () => void }) {
  const [i, setI] = useState(Math.min(start, Math.max(slides.length - 1, 0)));
  const rail = useRef<HTMLDivElement>(null);
  const f = FORMATS[formatFor(post.platform)];
  useScrollLock(true);
  const y = useMotionValue(0);
  const fade = useTransform(y, [0, 300], [1, 0.35]);
  const shell = useRef<HTMLDivElement>(null);
  useSwipeDismiss(shell, y, true, onClose);
  const go = useCallback((n: number) => { const el = rail.current; if (!el) return; const t = Math.max(0, Math.min(slides.length - 1, n)); el.scrollTo({ left: t * el.clientWidth, behavior: "smooth" }); }, [slides.length]);
  useLayoutEffect(() => { const el = rail.current; if (el) el.scrollLeft = i * el.clientWidth; /* open on the tapped image */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } else if (e.key === "ArrowRight") go(i + 1); else if (e.key === "ArrowLeft") go(i - 1); };
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true); // capture: Esc closes the viewer only, not the editor behind it
  }, [i, go, onClose]);
  const size = `min(92vw, calc((100svh - 170px) * ${f.w / f.h}))`;
  return createPortal(
    <motion.div ref={shell} className="fixed inset-0 z-[120] flex flex-col" style={{ background: "rgba(8,8,10,.94)", y, opacity: fade }} role="dialog" aria-modal="true" aria-label="Post images" onClick={onClose}>
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),14px)] text-white" onClick={(e) => e.stopPropagation()}>
        <span className="text-[15px] font-semibold">{i + 1} / {slides.length}</span>
        <button className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15" onClick={onClose} aria-label="Close"><X size={22} /></button>
      </div>
      <div ref={rail} className="no-scrollbar relative flex flex-1 snap-x snap-mandatory overflow-x-auto" style={{ touchAction: "pan-x" }} onScroll={(e) => { const el = e.currentTarget; const n = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)); if (n !== i) setI(n); }}>
        {slides.map((s, n) => (
          <div key={n} className="flex h-full w-full shrink-0 snap-center items-center justify-center" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: size }}><SlideImage slide={s} index={n} total={slides.length} post={post} brand={brand} width={1080} rounded={18} className="w-full" /></div>
          </div>
        ))}
        {slides.length > 1 && <>
          <button className="absolute left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white sm:flex disabled:opacity-30" disabled={i === 0} onClick={(e) => { e.stopPropagation(); go(i - 1); }} aria-label="Previous image"><ChevronLeft size={26} /></button>
          <button className="absolute right-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white sm:flex disabled:opacity-30" disabled={i === slides.length - 1} onClick={(e) => { e.stopPropagation(); go(i + 1); }} aria-label="Next image"><ChevronRight size={26} /></button>
        </>}
      </div>
      {slides.length > 1 && <div className="flex justify-center gap-2 pb-[max(env(safe-area-inset-bottom),18px)] pt-3" onClick={(e) => e.stopPropagation()}>{slides.map((_, n) => <button key={n} aria-label={`Image ${n + 1}`} onClick={() => go(n)} className="h-2.5 rounded-full transition-all" style={{ width: n === i ? 22 : 10, background: n === i ? "#fff" : "rgba(255,255,255,.4)" }} />)}</div>}
    </motion.div>,
    document.body,
  );
}
