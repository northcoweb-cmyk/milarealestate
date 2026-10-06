"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { fmtRange } from "@/lib/time";
import { useApp } from "./app-context";

export interface EventCardData { id: string; kind: string; title: string; start_at: string; end_at: string; property_id: string | null; location: string | null }

/** Street View of the event's address: the linked property when there is one, else any street address in the location. */
export function eventPhotoUrl(e: Pick<EventCardData, "property_id" | "location">): string | null {
  if (e.property_id) return `/api/properties/${e.property_id}/streetview?size=800x440`;
  if (e.location && /\d/.test(e.location) && e.location.length >= 8) return `/api/places/streetview?q=${encodeURIComponent(e.location)}&size=800x440`;
  return null;
}

const kickerOf = (iso: string, tz: string) => {
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  const md = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(d);
  return `${wd} · ${md}`.toUpperCase();
};

/** A wide card with the property's photo behind the event: date, big serif title, time and address. */
export function EventPhotoCard({ e, address, onClick, href }: { e: EventCardData; address?: string | null; onClick?: () => void; href?: never }) {
  const { profile } = useApp();
  const tz = profile.timezone;
  const [bad, setBad] = useState(false);
  const src = eventPhotoUrl(e);
  const title = e.title.split(" — ")[0];
  const where = address ?? e.location;
  const inner = (
    <>
      {src && !bad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#8fb4ff,#a68cff 55%,#ffc9a8)" }} aria-hidden />}
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(8,8,12,.78) 0%, rgba(8,8,12,.42) 55%, rgba(8,8,12,.12) 100%)" }} aria-hidden />
      <div className="relative flex h-full min-h-[148px] flex-col justify-center gap-1 px-5 py-4 text-left text-white">
        <p className="text-[12px] font-semibold uppercase tracking-[.2em]" style={{ color: "rgba(255,226,200,.92)" }}>{kickerOf(e.start_at, tz)}</p>
        <p className="display text-[34px] leading-[1.02]" style={{ textWrap: "balance" } as React.CSSProperties}>{title}</p>
        <p className="truncate text-[15px] font-medium text-white/90">{fmtRange(e.start_at, e.end_at, tz)}{where ? ` · ${where}` : ""}</p>
      </div>
      <ChevronRight size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80" aria-hidden />
    </>
  );
  const style = { borderRadius: 28, border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 10px 30px rgba(0,0,0,.28)" } as const;
  return <button type="button" onClick={onClick} className="relative block w-full overflow-hidden" style={style} aria-label={`${title}, ${where ?? ""}`}>{inner}</button>;
}
