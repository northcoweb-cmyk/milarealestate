"use client";

import { useState } from "react";
import { Bath, BedDouble, Home, Ruler } from "lucide-react";
import clsx from "clsx";
import type { ActionButton, ListingCardData } from "@/lib/types";
import { useListingPhotos } from "./use-listing-photos";

type Act = (a: { type: string; [k: string]: unknown }) => void;
const money = (n: number | null) => (n == null ? "" : `$${n.toLocaleString("en-US")}`);

export function Photo({ src, alt }: { src: string | null; alt: string }) {
  const [badSrc, setBadSrc] = useState<string | null>(null);
  const bad = !src || badSrc === src;
  if (bad) return <div className="flex h-full w-full items-center justify-center" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--ink) 8%, transparent))" }} aria-hidden><Home size={34} className="faint" /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src!} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBadSrc(src)} className="h-full w-full object-cover" />;
}

export function ListingCard({ c, photo, onAction, onNavigate, busy }: { c: ListingCardData; photo?: string | null; onAction: Act; onNavigate: (href: string) => void; busy?: boolean }) {
  const place = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const full = [c.address, place].filter(Boolean).join(", ");
  return (
    <article role="listitem" className="glass-strong flex w-[262px] shrink-0 snap-start flex-col overflow-hidden !p-0" aria-label={full}>
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <Photo src={photo ?? c.photo ?? c.image} alt={photo ?? c.photo ? `Photo of ${full}` : `Street view of ${full}`} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2" style={{ background: "linear-gradient(to top, rgba(0,0,0,.62), transparent)" }} />
        {c.badge && <span className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={{ background: "rgba(255,255,255,.92)", color: "#111" }}>{c.badge}</span>}
        {c.price != null && <span className="absolute bottom-2.5 left-3 text-[22px] font-extrabold leading-none text-white drop-shadow">{money(c.price)}{c.rental ? <span className="text-[13px] font-semibold">/mo</span> : null}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">{c.address}</p>
          <p className="muted truncate text-[13.5px]">{place || "Address only"}</p>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
          {c.beds != null && <span className="inline-flex items-center gap-1"><BedDouble size={15} aria-hidden />{c.beds} bd</span>}
          {c.baths != null && <span className="inline-flex items-center gap-1"><Bath size={15} aria-hidden />{c.baths} ba</span>}
          {c.sqft != null && <span className="inline-flex items-center gap-1"><Ruler size={15} aria-hidden />{c.sqft.toLocaleString("en-US")} sf</span>}
        </p>
        {(c.type || c.lines?.length || c.mls) && <p className="faint truncate text-[12px]">{[c.type, c.lines?.[0], c.mls].filter(Boolean).join(" · ")}</p>}
        <div className="mt-auto flex gap-2 pt-1">
          {c.rental
            ? <button disabled={busy} className="btn btn-primary btn-sm !min-h-[40px] flex-1" onClick={() => onAction({ type: "save_rental", card: { address: c.address, city: c.city, state: c.state, zip: c.zip, price: c.price, beds: c.beds, baths: c.baths, sqft: c.sqft, note: c.lines?.[0] ?? null } })}>Save for a client</button>
            : <>
              <button disabled={busy} className="btn btn-primary btn-sm !min-h-[40px] flex-1" onClick={() => onAction({ type: "prompt", text: `Prep for ${full}` })}>Prep</button>
              {c.propertyId
                ? <button className="btn btn-sm !min-h-[40px] flex-1" onClick={() => onNavigate(`/properties/${c.propertyId}`)}>Open</button>
                : <button disabled={busy} className="btn btn-sm !min-h-[40px] flex-1" onClick={() => onAction({ type: "save_listing", card: { address: c.address, city: c.city, state: c.state, zip: c.zip, price: c.price, beds: c.beds, baths: c.baths, sqft: c.sqft } })}>Save</button>}
            </>}
        </div>
      </div>
    </article>
  );
}

export function ListingRail({ title, subtitle, cards, buttons, onAction, onNavigate, busy }: { title: string; subtitle?: string; cards: ListingCardData[]; buttons?: ActionButton[]; onAction: Act; onNavigate: (href: string) => void; busy?: boolean }) {
  const photoOf = useListingPhotos(cards.map((c) => ({ key: c.id, address: c.address, city: c.city, state: c.state, zip: c.zip, listingId: c.propertyId ? undefined : c.id, propertyId: c.propertyId })), { enrich: true });
  return (
    <section aria-label={title}>
      <p className="kicker mb-2 px-1">{title}{subtitle ? ` · ${subtitle}` : ""}</p>
      <div role="list" className={clsx("no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2")}>
        {cards.map((c) => <ListingCard key={c.id} c={c} photo={photoOf(c.id)} onAction={onAction} onNavigate={onNavigate} busy={busy} />)}
      </div>
      {buttons?.length ? <div className="mt-2 flex flex-wrap gap-2">{buttons.map((b, i) => <button key={i} className="btn btn-sm" onClick={() => (b.action ? onAction(b.action) : b.href ? onNavigate(b.href) : undefined)}>{b.label}</button>)}</div> : null}
    </section>
  );
}
