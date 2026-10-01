"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import { Empty, PageHeader, Sheet, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { addDays, fmtRange, partsIn, startOfDay, zonedToUtc } from "@/lib/time";
import { ShowingsRail } from "@/components/ui/property-card";
import type { ShowingCardData } from "@/lib/showings";

interface Data { events: CalendarEvent[]; google: { connected: boolean; account?: string | null; calendar?: boolean } }
const KIND_COLOR: Record<string, string> = { open_house: "#e0875f", showing: "#4a6cf7", call: "#7a5cf2", lunch: "#3aa57d", closing: "#d1444a", meeting: "#6a7fb8", other: "#8a93bd" };

export default function CalendarPage() {
  const { profile, toast, capabilities } = useApp();
  const tz = profile.timezone;
  const today = useMemo(() => startOfDay(new Date(), tz), [tz]);
  const [sel, setSel] = useState(0);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const from = today.toISOString(), to = addDays(today, 60, tz).toISOString();
  const { data, loading, reload } = useApi<Data>(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const showings = useApi<{ showings: ShowingCardData[] }>("/api/showings?days=21");
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(today, i, tz)), [today, tz]);
  const key = (d: Date) => { const p = partsIn(d, tz); return `${p.y}-${p.m}-${p.d}`; };
  const byDay = useMemo(() => { const m = new Map<string, CalendarEvent[]>(); for (const e of data?.events ?? []) { const k = key(new Date(e.start_at)); m.set(k, [...(m.get(k) ?? []), e]); } return m; }, [data, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayEvents = byDay.get(key(days[sel])) ?? [];
  const overlaps = (e: CalendarEvent) => dayEvents.some((o) => o.id !== e.id && new Date(o.start_at) < new Date(e.end_at) && new Date(e.start_at) < new Date(o.end_at));

  async function sync() {
    setSyncing(true);
    try { const r = await jfetch<{ added: number; updated: number }>("/api/calendar/sync", { method: "POST" }); toast(`Synced — ${r.added} new, ${r.updated} updated.`, "success"); reload(); }
    catch (e: any) { toast(e?.message ?? "Couldn't sync.", "error"); } finally { setSyncing(false); }
  }
  const dayLabel = (d: Date, i: number) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(d));

  return (
    <Page>
      <PageHeader title="Calendar" sub={data?.google.connected ? `Google Calendar · ${data.google.account ?? "connected"}` : "Mila's calendar"} right={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={18} />Add</button>} />
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Days">
        {days.map((d, i) => {
          const n = byDay.get(key(d))?.length ?? 0; const p = partsIn(d, tz);
          return (
            <button key={i} role="tab" aria-selected={sel === i} onClick={() => setSel(i)} className="glass flex w-[62px] shrink-0 flex-col items-center py-3 transition" style={{ borderRadius: 22, ...(sel === i ? { background: "linear-gradient(135deg,var(--accent),var(--accent-2))", color: "var(--accent-ink)", borderColor: "transparent" } : {}) }}>
              <span className="text-[11.5px] font-bold uppercase tracking-wider opacity-80">{new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d)}</span>
              <span className="display text-[28px] leading-tight">{p.d}</span>
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: n ? (sel === i ? "var(--accent-ink)" : "var(--accent)") : "transparent" }} />
            </button>
          );
        })}
      </div>
      <h2 className="h2 mb-3">{dayLabel(days[sel], sel)}</h2>
      {(() => { const todays = (showings.data?.showings ?? []).filter((x) => key(new Date(x.when.startIso)) === key(days[sel])); return todays.length ? <div className="mb-5"><ShowingsRail items={todays} /></div> : null; })()}
      {loading && !data ? <Skeleton className="h-40" /> : dayEvents.length ? (
        <ul className="space-y-3">
          {dayEvents.map((e) => (
            <li key={e.id} className="glass flex gap-4 p-4" style={{ borderRadius: 24 }}>
              <div className="w-[78px] shrink-0"><p className="font-semibold leading-tight">{fmtRange(e.start_at, e.end_at, tz)}</p></div>
              <div className="min-w-0 flex-1 border-l-[3px] pl-4" style={{ borderColor: KIND_COLOR[e.kind] ?? KIND_COLOR.other }}>
                <p className="font-semibold leading-snug">{e.title}</p>
                {e.location && <p className="faint truncate text-[13.5px]">{e.location}</p>}
                {e.property_id && <Link href={`/properties/${e.property_id}`} className="mt-0.5 inline-block text-[13px] font-semibold text-accent">View property</Link>}
                <p className="faint mt-1 text-[12px]">{e.source === "google" ? "From Google Calendar" : e.synced_at ? "In Google Calendar" : "Mila calendar"}</p>
                {overlaps(e) && <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--warn)" }}>Overlaps another event</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty title="Nothing scheduled" body="Add an event, or just tell Mila: “Schedule a showing Friday at 3.”" />}

      <div className="glass mt-8 flex flex-wrap items-center gap-4 p-5" style={{ borderRadius: 24 }}>
        <div className="min-w-0 flex-1"><p className="font-semibold">Google Calendar</p><p className="muted text-[14px]">{data?.google.connected ? "Mila checks it for conflicts and adds events to it." : capabilities.google ? "Connect so Mila can check conflicts and add events." : "Not set up on this server yet."}</p></div>
        {data?.google.connected ? <button className="btn btn-sm" onClick={sync} disabled={syncing}><RefreshCw size={16} className={syncing ? "animate-spin" : ""} />Sync now</button> : capabilities.google ? <a className="btn btn-primary btn-sm" href="/api/integrations/google/start?services=calendar">Connect</a> : null}
      </div>
      <AddEvent open={adding} onClose={() => setAdding(false)} defaultDay={days[sel]} onDone={reload} />
    </Page>
  );
}

function AddEvent({ open, onClose, defaultDay, onDone }: { open: boolean; onClose: () => void; defaultDay: Date; onDone: () => void }) {
  const { profile, toast } = useApp();
  const tz = profile.timezone;
  const p = partsIn(defaultDay, tz);
  const iso = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  const [f, setF] = useState({ title: "", kind: "showing", date: iso, time: "10:00", mins: "60", location: "" });
  const [conflict, setConflict] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (ignore = false) => {
    setBusy(true); setConflict(null);
    try {
      const [y, m, d] = f.date.split("-").map(Number); const [h, mi] = f.time.split(":").map(Number);
      const start = zonedToUtc(y, m, d, h, mi, tz);
      await jfetch("/api/calendar", { method: "POST", json: { title: f.title, kind: f.kind, start_at: start.toISOString(), end_at: new Date(start.getTime() + Number(f.mins) * 60000).toISOString(), location: f.location, ignoreConflicts: ignore } });
      toast("Added to your calendar.", "success"); onDone(); onClose();
    } catch (e: any) { if (e?.data?.code === "conflict") setConflict(e.message); else toast(e?.message ?? "Couldn't add it.", "error"); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add event">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div><label className="lbl">Title</label><input className="field" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Showing — 123 Main Street" /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="lbl">Date</label><input type="date" className="field" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></div><div><label className="lbl">Start</label><input type="time" className="field" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} required /></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="lbl">Type</label><select className="field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{["showing", "open_house", "call", "meeting", "lunch", "closing", "other"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select></div><div><label className="lbl">Length</label><select className="field" value={f.mins} onChange={(e) => setF({ ...f, mins: e.target.value })}>{[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}</select></div></div>
        <div><label className="lbl">Location</label><input className="field" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
        {conflict && <div className="rounded-2xl p-3 text-[14.5px]" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)" }}><p className="font-semibold">{conflict}</p><p className="muted">I never double-book without asking.</p><button type="button" className="btn btn-sm mt-2" onClick={() => submit(true)}>Add it anyway</button></div>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Checking calendar…" : "Add event"}</button>
      </form>
    </Sheet>
  );
}
