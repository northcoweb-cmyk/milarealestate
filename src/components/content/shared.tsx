"use client";

import type { SocialPost, SocialPlatform } from "@/lib/types";

export const PLATFORM_META: Record<SocialPlatform, { label: string; short: string; color: string }> = {
  instagram: { label: "Instagram", short: "IG", color: "#1a1a1a" },
  facebook: { label: "Facebook", short: "FB", color: "#3a3a3c" },
  tiktok: { label: "TikTok", short: "TT", color: "#000000" },
  linkedin: { label: "LinkedIn", short: "in", color: "#555558" },
  x: { label: "X", short: "X", color: "#161618" },
};

export const STATUS_META: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "accent" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" }, pending_approval: { label: "Needs approval", tone: "warn" }, approved_unpublished: { label: "Ready to post", tone: "accent" },
  scheduled: { label: "Scheduled", tone: "ok" }, published: { label: "Posted", tone: "ok" }, archived: { label: "Archived", tone: "neutral" }, failed: { label: "Failed", tone: "danger" },
};

export function PlatformBadge({ platform, size = 26 }: { platform: SocialPlatform; size?: number }) {
  const m = PLATFORM_META[platform];
  return <span title={m.label} className="inline-flex shrink-0 items-center justify-center rounded-lg font-bold text-white" style={{ width: size, height: size, background: m.color, fontSize: size * 0.4 }}>{m.short}</span>;
}

/** Small thumbnail of the first slide. */
export function MiniSlide({ post }: { post: SocialPost }) {
  const s = post.slides[0];
  const g = "linear-gradient(160deg,#111,#4a4a4d 60%,#9a9a9e)";
  return (
    <div className="relative h-[92px] w-[74px] shrink-0 overflow-hidden rounded-xl text-white" style={{ background: s?.image_id ? `url(/api/files/${s.image_id}) center/cover` : g }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,12,40,.05), rgba(8,12,40,.65))" }} />
      <p className="display absolute inset-x-1.5 bottom-1.5 line-clamp-3 text-[12.5px] leading-[1.05]">{s?.headline ?? post.caption.split("\n")[0]}</p>
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
