"use client";

import Link from "next/link";
import { useState } from "react";
import { Bath, BedDouble, CalendarClock, Check, FileSignature, Ruler, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { PropertyCardInfo, Stage } from "@/lib/property-stage";
import { STAGES } from "@/lib/property-stage";
import { Sheet, jfetch } from "./ui";
import { Photo } from "./listing-cards";
import { useMila } from "./mila-chat";
import { useApp } from "./app-context";

const money = (n: number | null | undefined) => (n ? `$${n.toLocaleString("en-US")}` : "");
const whenOf = (iso: string, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dayOf = (iso: string, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(iso));
const KIND: Record<string, string> = { open_house: "Open house", showing: "Showing", closing: "Closing", meeting: "Meeting", call: "Call", other: "Deadline", lunch: "Meeting" };

const DOT: Record<Stage, string> = { active: "var(--ok)", under_contract: "var(--warn)", upcoming: "var(--ink-faint)", sold: "var(--accent)", archived: "var(--ink-faint)" };

export function PropertyCard({ p, photo, onChanged }: { p: PropertyCardInfo; photo?: string | null; onChanged: () => void }) {
  const { profile } = useApp();
  const tz = profile.timezone;
  const mila = useMila();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const place = [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const price = p.stage === "sold" ? p.sold_price ?? p.list_price : p.list_price ?? p.est_value;
  const priceTag = p.stage === "sold" ? "Sold" : !p.list_price && p.est_value ? "Est." : "";
  const daysToClose = p.closing_at ? Math.max(0, Math.ceil((new Date(p.closing_at).getTime() - now) / 86_400_000)) : null;

  async function setStage(stage: Stage | "auto") {
    setBusy(true);
    try { await jfetch(`/api/properties/${p.id}`, { method: "PATCH", json: { stage } }); setSheet(false); onChanged(); } finally { setBusy(false); }
  }

  const status =
    p.stage === "sold" ? <><Check size={15} aria-hidden /> Closed{p.sold_note ? ` · ${p.sold_note.replace(/^closed\s*/i, "")}` : ""}</> :
    p.stage === "under_contract" ? <><FileSignature size={15} aria-hidden /> {p.closing_at ? `Closing ${dayOf(p.closing_at, tz)}${daysToClose != null ? ` · ${daysToClose === 0 ? "today" : `${daysToClose}d`}` : ""}` : "Under contract"}</> :
    p.next ? <><CalendarClock size={15} aria-hidden /> {KIND[p.next.kind] ?? p.next.title.split(" — ")[0]} · {whenOf(p.next.start_at, tz)}</> :
    p.stage === "archived" ? <>Archived</> :
    <><Sparkles size={15} aria-hidden /> {p.stage === "active" ? "Live — nothing scheduled" : "Nothing scheduled yet"}</>;

  return (
    <article className="glass-strong flex flex-col overflow-hidden !p-0" aria-label={`${p.address}, ${p.stage_label}`}>
      <Link href={`/properties/${p.id}`} className="block outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          <Photo src={p.image_source === "photo" ? p.image : photo ?? p.image} alt={`${p.image_source === "photo" || photo ? "Photo" : "Street view"} of ${p.address}`} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2" style={{ background: "linear-gradient(to top, rgba(0,0,0,.62), transparent)" }} />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: "rgba(255,255,255,.93)", color: "#111" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: DOT[p.stage] }} aria-hidden />{p.stage_label}
          </span>
          {price ? <span className="absolute bottom-3 left-3.5 flex items-baseline gap-1.5 text-white drop-shadow"><span className="text-[24px] font-extrabold leading-none">{money(price)}</span>{priceTag && <span className="text-[12px] font-semibold opacity-90">{priceTag}</span>}</span> : <span className="absolute bottom-3 left-3.5 text-[14px] font-semibold text-white/90 drop-shadow">Price not set</span>}
          <span className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: p.market === "on" ? "rgba(34,160,90,.95)" : "rgba(30,30,32,.72)", color: "#fff" }}>{p.market === "on" ? "On market" : "Off market"}</span>
          {p.days_on_market != null && p.stage === "active" && <span className="absolute bottom-3 right-3.5 text-[12px] font-semibold text-white/90 drop-shadow">{p.days_on_market}d on market</span>}
        </div>
        <div className="space-y-2 px-4 pt-3.5">
          <div className="min-w-0"><p className="truncate text-[17px] font-semibold leading-tight">{p.address}</p><p className="muted truncate text-[14px]">{place || "Add the city & state"}</p>{p.kind.group !== "unknown" && <p className="mt-1"><span className="inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold" title={p.kind.note} style={{ background: p.kind.group === "residential" ? "var(--line)" : "var(--accent)", color: p.kind.group === "residential" ? "var(--ink-soft)" : "var(--accent-ink)" }}>{p.kind.label}</span></p>}</div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px]">
            {p.beds != null && p.kind.group !== "commercial" && p.kind.group !== "land" && <span className="inline-flex items-center gap-1.5"><BedDouble size={16} aria-hidden />{p.beds} bd</span>}
            {p.baths != null && p.kind.group !== "commercial" && p.kind.group !== "land" && <span className="inline-flex items-center gap-1.5"><Bath size={16} aria-hidden />{p.baths} ba</span>}
            {p.sqft != null && <span className="inline-flex items-center gap-1.5"><Ruler size={16} aria-hidden />{p.sqft.toLocaleString("en-US")} sf</span>}
            {!p.has_data && <span className="muted">Details not filled in yet</span>}
          </p>
          <p className="faint truncate text-[13px]">{[p.kind.group === "unknown" ? p.property_type : null, p.year_built && `Built ${p.year_built}`, p.verified ? "Confirmed" : p.has_data ? "Unconfirmed" : ""].filter(Boolean).join(" · ")}</p>
          <p className="hairline inline-flex w-full items-center gap-2 pt-2.5 text-[13.5px] font-semibold">{status}</p>
        </div>
      </Link>
      <div className="flex gap-2 px-4 pb-4 pt-3">
        <button className="btn btn-sm !min-h-[40px] flex-1" onClick={() => setSheet(true)}>Stage</button>
        <button className="btn btn-sm btn-primary !min-h-[40px] flex-1" onClick={() => mila.ask(`Prep for ${p.address}${p.city ? `, ${p.city}` : ""}${p.state ? ` ${p.state}` : ""}`)}>Ask Mila</button>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={`Where is ${p.address}?`}>
        <ul className="space-y-1.5">
          {STAGES.map((s) => (
            <li key={s.key}><button disabled={busy} onClick={() => setStage(s.key)} className={clsx("flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition", p.stage === s.key && "bg-[var(--line)]")}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOT[s.key] }} aria-hidden />
              <span className="min-w-0 flex-1"><span className="block font-semibold">{s.label}</span><span className="faint block text-[13px]">{s.blurb}</span></span>
              {p.stage === s.key && <Check size={18} aria-hidden />}
            </button></li>
          ))}
        </ul>
        {p.manual_stage && <button disabled={busy} className="btn btn-quiet mt-3 w-full" onClick={() => setStage("auto")}>Let Mila decide again</button>}
      </Sheet>
    </article>
  );
}
