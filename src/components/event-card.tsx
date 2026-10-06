"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronRight, Home, MapPin, MessageSquareText, Share2 } from "lucide-react";
import { fmtRange } from "@/lib/time";
import { useApp } from "./app-context";

export interface EventCardData { id: string; kind: string; title: string; start_at: string; end_at: string; property_id: string | null; location: string | null; notes?: string | null }
export interface EventPerson { name: string; phone: string | null; email: string | null }
export interface EventPlace { address: string; city: string | null; state: string | null; list_price: number | null; beds: number | null; baths: number | null; sqft: number | null }

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
const KIND_LABEL: Record<string, string> = { open_house: "Open house", showing: "Showing", call: "Call", meeting: "Meeting", lunch: "Lunch", closing: "Closing", other: "Event" };
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * A wide card with the property's photo behind the event. With `onClick` it is a plain link-style card (Home);
 * without it, tapping expands the card in place: facts, directions, follow-up, the property, and a share-by-text button.
 */
export function EventPhotoCard({ e, address, place, person, onClick, onMore }: { e: EventCardData; address?: string | null; place?: EventPlace | null; person?: EventPerson | null; onClick?: () => void; onMore?: () => void }) {
  const { profile, toast } = useApp();
  const tz = profile.timezone;
  const [bad, setBad] = useState(false);
  const [open, setOpen] = useState(false);
  const src = eventPhotoUrl(e);
  const title = e.title.split(" — ")[0];
  const where = address ?? e.location;
  const kind = KIND_LABEL[e.kind] ?? "Event";
  const facts = place ? [place.list_price ? money(place.list_price) : null, place.beds != null ? `${place.beds} bd` : null, place.baths != null ? `${place.baths} ba` : null, place.sqft ? `${place.sqft.toLocaleString("en-US")} sqft` : null].filter(Boolean).join(" · ") : "";
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(e.start_at));
  const range = fmtRange(e.start_at, e.end_at, tz);
  const mapsUrl = where ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}` : null;
  const ask = (q: string) => `/?ask=${encodeURIComponent(q)}`;
  const followUp = person ? ask(`Draft a follow-up message to ${person.name} about ${title}${where ? ` at ${where}` : ""}`) : ask(`Draft follow-ups for everyone who came to ${title}${where ? ` at ${where}` : ""}`);

  // A text the agent can send to anyone: what, when, where, the facts, and the way there.
  const shareText = [`${kind}: ${day}, ${range}`, where, facts || null, mapsUrl ? `Directions: ${mapsUrl}` : null, `— ${profile.full_name}`].filter(Boolean).join("\n");
  async function share() {
    try { if (typeof navigator !== "undefined" && navigator.share) { await navigator.share({ text: shareText }); return; } } catch (err) { if ((err as Error)?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(shareText); toast("Details copied. Paste them into a text.", "success"); } catch { window.location.href = `sms:?&body=${encodeURIComponent(shareText)}`; }
  }

  const photo = (
    <>
      {src && !bad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#8fb4ff,#a68cff 55%,#ffc9a8)" }} aria-hidden />}
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(8,8,12,.78) 0%, rgba(8,8,12,.42) 55%, rgba(8,8,12,.12) 100%)" }} aria-hidden />
      <div className="relative flex min-h-[148px] flex-col justify-center gap-1 py-4 pl-5 pr-12 text-left text-white">
        <p className="text-[12px] font-semibold uppercase tracking-[.2em]" style={{ color: "rgba(255,226,200,.92)" }}>{kickerOf(e.start_at, tz)}</p>
        <p className="display text-[34px] leading-[1.02]" style={{ textWrap: "balance" } as React.CSSProperties}>{title}</p>
        <p className="truncate text-[15px] font-medium text-white/90">{range}{where ? ` · ${where}` : ""}</p>
      </div>
      {onClick ? <ChevronRight size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80" aria-hidden /> : <motion.span className="absolute right-4 top-[74px] -translate-y-1/2 text-white/85" animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 320, damping: 26 }} aria-hidden><ChevronDown size={22} /></motion.span>}
    </>
  );

  const shell = { borderRadius: 28, border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 10px 30px rgba(0,0,0,.28)", background: "#0e0e14" } as const;
  if (onClick) return <button type="button" onClick={onClick} className="relative block w-full overflow-hidden" style={shell} aria-label={`${title}, ${where ?? ""}`}>{photo}</button>;

  return (
    <motion.div layout transition={{ type: "spring", stiffness: 300, damping: 32 }} className="relative w-full overflow-hidden" style={shell}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="relative block w-full overflow-hidden text-left" aria-label={`${title}, ${where ?? ""}. ${open ? "Collapse" : "Expand"} details`}>{photo}</button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="more" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 34, opacity: { duration: 0.2 } }} className="overflow-hidden text-white" style={{ background: "rgba(14,14,20,.96)" }}>
            <div className="space-y-3.5 px-5 pb-5 pt-4">
              <dl className="space-y-2.5 text-[15px] leading-snug">
                <Row k="When">{day} · {range}</Row>
                {where && <Row k="Where">{where}</Row>}
                {facts && <Row k="Property">{facts}</Row>}
                {person && <Row k="With">{person.name}{[person.phone, person.email].filter(Boolean).length ? <span className="block text-white/60">{[person.phone, person.email].filter(Boolean).join(" · ")}</span> : null}</Row>}
                {e.notes && <Row k="Notes"><span className="whitespace-pre-line">{e.notes}</span></Row>}
              </dl>
              <div className="grid grid-cols-2 gap-2.5">
                {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="act"><MapPin size={17} aria-hidden />Directions</a>}
                <Link href={followUp} className="act"><MessageSquareText size={17} aria-hidden />Follow-up</Link>
                {e.property_id && <Link href={`/properties/${e.property_id}`} className="act"><Home size={17} aria-hidden />Property</Link>}
                <button type="button" onClick={share} className="act"><Share2 size={17} aria-hidden />Send details</button>
              </div>
              {onMore && <button type="button" onClick={onMore} className="w-full py-1.5 text-center text-[14px] font-semibold text-white/70">Reschedule or edit</button>}
            </div>
            <style>{`.act{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;border-radius:16px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);font-weight:600;font-size:15px;color:#fff}.act:active{background:rgba(255,255,255,.2)}`}</style>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex gap-4"><dt className="w-[70px] shrink-0 pt-[2px] text-[11.5px] font-bold uppercase tracking-[.14em] text-white/50">{k}</dt><dd className="min-w-0 flex-1 text-white/95">{children}</dd></div>;
}
