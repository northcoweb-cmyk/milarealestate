"use client";

import Link from "next/link";
import * as React from "react";
import { useEffect, useState } from "react";
import { ArrowRight, Bath, BedDouble, Expand, Home, Mail, MapPin, MessageSquare, Navigation, Phone, RotateCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ShowingCardData } from "@/lib/showings";

/**
 * Showing / open-house card. Merges 21st.dev "card-02" (photo, price badge, stats) and "card-14" (3D flip),
 * rebuilt for Mila: touch-first (tap anywhere to flip, with press feedback), real data only
 * (price/beds/baths/size appear only once the agent has verified them), and a back side whose
 * buttons do real things: directions, call/text/email the client, draft a follow-up with Mila, open the property.
 */

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function useMapsHref(address: string) {
  const q = encodeURIComponent(address);
  const [href, setHref] = useState(`https://www.google.com/maps/dir/?api=1&destination=${q}`);
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) setHref(`https://maps.apple.com/?daddr=${q}&dirflg=d`);
  }, [q]);
  return href;
}

function ActionLink({ href, icon: I, label, primary, external, disabled }: { href: string; icon: React.ElementType; label: string; primary?: boolean; external?: boolean; disabled?: boolean }) {
  const cls = cn(
    "flex h-11 items-center justify-center gap-1.5 rounded-2xl px-3 text-[13.5px] font-semibold outline-none transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring",
    primary ? "text-primary-foreground" : "border border-border bg-muted text-foreground hover:bg-muted/80",
    disabled && "pointer-events-none opacity-40",
  );
  const style = primary ? { background: "linear-gradient(135deg, var(--accent), var(--accent-2))" } : undefined;
  if (external || /^(tel|sms|mailto|https?):/.test(href)) return <a href={href} onClick={stop} className={cls} style={style} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} aria-disabled={disabled}><I size={16} />{label}</a>;
  return <Link href={href} onClick={stop} className={cls} style={style} aria-disabled={disabled}><I size={16} />{label}</Link>;
}

export function PropertyFlipCard({ data, className }: { data: ShowingCardData; className?: string }) {
  const [flipped, setFlipped] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const p = data.property;
  const maps = useMapsHref([p.address, p.city, p.state].filter(Boolean).join(", "));
  const photo = data.images[0] && !imgFailed ? data.images[0] : data.streetView && !imgFailed ? `/api/properties/${p.id}/streetview` : null;
  const isStreet = !data.images[0] && !!photo;
  const when = `${data.when.day} · ${data.kind === "open_house" ? `${data.when.time}–${data.when.endTime}` : data.when.time}`;
  const place = [p.city, p.state].filter(Boolean).join(", ");
  const hasFacts = p.beds != null || p.baths != null || p.sqft != null;
  const firstName = data.contact?.name.split(" ")[0];
  const toggle = () => setFlipped((f) => !f);
  const askFollowUp = data.contact
    ? `/?ask=${encodeURIComponent(`Draft a follow-up email to ${data.contact.name} about the showing at ${p.address}`)}`
    : `/?ask=${encodeURIComponent(`Draft a follow-up for everyone who came to ${p.address}`)}`;
  const phone = data.contact?.phone?.replace(/[^\d+]/g, "");

  return (
    <div
      className={cn("flip h-[480px] w-[308px] max-w-full cursor-pointer select-none rounded-[28px]", className)}
      data-flipped={flipped}
      onClick={toggle}
      style={{ filter: "drop-shadow(0 18px 30px rgba(20,30,80,.22))" }}
    >
      {/* keyboard users: a real button that flips the card */}
      <button type="button" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-pressed={flipped}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-card focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:ring-2 focus:ring-ring">
        {flipped ? "Show front of card" : `Show details for ${p.address}`}
      </button>

      <div className="flip-inner rounded-[28px]">
        {/* ------------------------------------------------------------- FRONT */}
        <Card className="flip-face flip-front rounded-[28px] border-border bg-card" {...({ inert: flipped } as object)}>
          <div className="flex h-full flex-col">
            <div className="relative h-[56%] shrink-0 overflow-hidden bg-muted">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt={isStreet ? `Street view of ${p.address}` : `Photo of ${p.address}`} loading="lazy" decoding="async" draggable={false} onError={() => setImgFailed(true)} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center" style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--accent) 38%, var(--sky-mid)), color-mix(in srgb, var(--accent-2) 30%, var(--sky-bottom)))" }}>
                  <Home size={34} className="text-white/85" />
                  <p className="px-6 text-[13px] font-semibold text-white/90">No photos yet</p>
                  <Link href={`/properties/${p.id}`} onClick={stop} className="rounded-full bg-[#0f1f55]/55 px-3.5 py-1.5 text-[12.5px] font-semibold text-white">Find photos</Link>
                </div>
              )}
              {photo && <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,12,40,.18) 0%, transparent 35%, rgba(8,12,40,.55) 100%)" }} />}
              <Badge className="absolute bottom-3 left-3 border-white/30 bg-black/45 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur-md hover:bg-black/45">{data.kind === "open_house" ? "Open house" : "Showing"} · {when}</Badge>
              {p.price != null && <Badge className="absolute right-3 top-3 border-transparent bg-white px-3.5 py-1.5 text-[14px] font-semibold text-[#0f2a5f] shadow-md hover:bg-white">{money(p.price)}</Badge>}
              {isStreet && <span className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2 py-0.5 text-[10.5px] font-medium text-white/90 backdrop-blur-md">Street View</span>}
              {data.images.length > 1 && <span className="absolute right-3 top-3 hidden" />}
            </div>

            <div className="flex flex-1 flex-col justify-between p-5">
              <div>
                <h3 className="display text-[27px] leading-[1.05] text-foreground">{p.address}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-[14.5px] text-muted-foreground"><MapPin size={14} />{place || "Add city & state"}</p>
                {hasFacts ? (
                  <div className="mt-3.5 flex items-center gap-4 text-[13.5px] text-foreground/85">
                    {p.beds != null && <span className="flex items-center gap-1.5"><BedDouble size={16} />{p.beds} bd</span>}
                    {p.baths != null && <span className="flex items-center gap-1.5"><Bath size={16} />{p.baths} ba</span>}
                    {p.sqft != null && <span className="flex items-center gap-1.5"><Expand size={16} />{p.sqft.toLocaleString()} sq ft</span>}
                  </div>
                ) : (
                  <Link href={`/properties/${p.id}`} onClick={stop} className="mt-3.5 inline-flex"><Badge variant="outline" className="border-border px-3 py-1 text-[12.5px] font-semibold text-accent">Confirm property details</Badge></Link>
                )}
              </div>
              <div className="flex items-center justify-between text-[12.5px] font-semibold tracking-wide text-muted-foreground">
                <span className="flex items-center gap-2">{data.contact ? <>With {firstName}</> : "Tap for details"}</span>
                <RotateCw size={16} />
              </div>
            </div>
          </div>
        </Card>

        {/* -------------------------------------------------------------- BACK */}
        <Card className="flip-face flip-back rounded-[28px] border-border bg-card" {...({ inert: !flipped } as object)}>
          <div className="flex h-full flex-col gap-3 p-5">
            <div>
              <p className="kicker">{data.kind === "open_house" ? "Open house" : "Showing"} · {when}</p>
              <h3 className="display mt-0.5 text-[24px] leading-tight text-foreground">{p.address}</h3>
              <p className="text-[13.5px] text-muted-foreground">{place || "City & state not added"}{p.isDemo ? " · demo property" : ""}</p>
            </div>

            {hasFacts || p.price != null ? (
              <div className="grid grid-cols-3 gap-2">
                {([[BedDouble, p.beds != null ? `${p.beds}` : "—", "Beds"], [Bath, p.baths != null ? `${p.baths}` : "—", "Baths"], [Expand, p.sqft != null ? p.sqft.toLocaleString() : "—", "Sq ft"]] as const).map(([I, v, l]) => (
                  <div key={l} className="flex flex-col items-center gap-0.5 rounded-2xl border border-border bg-muted py-2.5"><I size={17} className="text-accent" /><p className="text-[15px] font-bold leading-none text-foreground">{v}</p><p className="text-[11px] font-medium text-muted-foreground">{l}</p></div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-border bg-muted px-3.5 py-3 text-[13px] leading-snug text-muted-foreground">I only show price, beds and baths once you've confirmed them, so nothing here is guessed. <Link href={`/properties/${p.id}`} onClick={stop} className="font-semibold text-accent">Confirm details</Link></p>
            )}

            {data.contact ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted px-3 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: data.contact.color }}>{data.contact.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("")}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-[14.5px] font-semibold leading-tight text-foreground">{data.contact.name}</p><p className="truncate text-[12px] text-muted-foreground">{data.contact.phone ?? data.contact.email ?? "No contact info yet"}</p></div>
                <Link href={`/contacts/${data.contact.id}`} onClick={stop} className="text-[12.5px] font-semibold text-accent">Profile</Link>
              </div>
            ) : (
              <p className="px-1 text-[12.5px] text-muted-foreground">No client is attached to this {data.kind === "open_house" ? "open house" : "showing"}.</p>
            )}

            <div className="mt-auto grid grid-cols-2 gap-2">
              <ActionLink href={maps} icon={Navigation} label="Directions" primary external />
              <ActionLink href={askFollowUp} icon={Sparkles} label="Follow-up" />
              {data.contact && <ActionLink href={phone ? `tel:${phone}` : "#"} icon={Phone} label="Call" disabled={!phone} />}
              {data.contact && <ActionLink href={phone ? `sms:${phone}` : "#"} icon={MessageSquare} label="Text" disabled={!phone} />}
              {data.contact?.email && <ActionLink href={`mailto:${data.contact.email}`} icon={Mail} label="Email" />}
              <ActionLink href={`/properties/${p.id}`} icon={ArrowRight} label="Property" />
            </div>
            <p className="flex items-center justify-center gap-1.5 text-[11.5px] font-semibold tracking-wide text-muted-foreground"><RotateCw size={12} />Tap the card to flip back</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Horizontally swipeable row of cards (snap scrolling) for phones; wraps into a grid on wide screens. */
export function ShowingsRail({ items, className }: { items: ShowingCardData[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={cn("no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 pt-1 sm:mx-0 sm:px-0", className)} role="list" aria-label="Upcoming showings">
      {items.map((d) => <div key={d.eventId} role="listitem" className="snap-center first:ml-0"><PropertyFlipCard data={d} /></div>)}
    </div>
  );
}
