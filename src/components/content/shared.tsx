"use client";

import { useEffect, useState } from "react";
import type { SocialPost, SocialPlatform, SocialSlide } from "@/lib/types";
import { FORMATS, formatFor } from "@/lib/content/design";
import { previewUrl, type Brand } from "@/lib/content/render";

export const PLATFORM_META: Record<SocialPlatform, { label: string; short: string; color: string }> = {
  instagram: { label: "Instagram", short: "IG", color: "#1a1a1a" },
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
