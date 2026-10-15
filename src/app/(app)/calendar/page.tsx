"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarPlus, ChevronRight, ClipboardCheck, MapPin, Plane, Plus } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import { Empty, PageHeader, Sheet, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { PlaceInput } from "@/components/place-input";
import { syncLabel } from "@/lib/calendar-sync";
import { eventEmoji } from "@/lib/emoji";
import { addDays, fmtRange, fmtTime, partsIn, startOfDay, zonedToUtc } from "@/lib/time";
import { EventPhotoCard } from "@/components/event-card";
import { ServiceLogo } from "@/components/brand-logos";

interface Person { name: string; phone: string | null; email: string | null; type: string }
interface Place { address: string; city: string | null; state: string | null; list_price: number | null; beds: number | null; baths: number | null; sqft: number | null; verified: boolean }
interface Data { reminders?: { id: string; title: string; remind_at: string; event_id: string | null }[]; people: Record<string, Person>; places: Record<string, Place>; events: CalendarEvent[]; google: { connected: boolean; account?: string | null; calendar?: boolean }; link?: { connected: boolean; host?: string | null } }
const KIND_COLOR: Record<string, string> = { open_house: "#111111", showing: "#444447", call: "#6e6e73", lunch: "#8e8e93", closing: "#111111", meeting: "#5a5a5e", other: "#a1a1a6" };

export default function CalendarPage() {
  const { profile, toast, capabilities } = useApp();
  const tz = profile.timezone;
  const today = useMemo(() => startOfDay(new Date(), tz), [tz]);
  const [sel, setSel] = useState(0);
  const [adding, setAdding] = useState(false);
  const [ooo, setOoo] = useState(false);
  const [openEv, setOpenEv] = useState<CalendarEvent | null>(null);
  const from = today.toISOString(), to = addDays(today, 60, tz).toISOString();
  const { data, loading, reload } = useApi<Data>(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(today, i, tz)), [today, tz]);
  const key = (d: Date) => { const p = partsIn(d, tz); return `${p.y}-${p.m}-${p.d}`; };
  const byDay = useMemo(() => { const m = new Map<string, CalendarEvent[]>(); for (const e of data?.events ?? []) { const k = key(new Date(e.start_at)); m.set(k, [...(m.get(k) ?? []), e]); } return m; }, [data, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayEvents = byDay.get(key(days[sel])) ?? [];
  const dayReminders = (data?.reminders ?? []).filter((r) => key(new Date(r.remind_at)) === key(days[sel]));
  const overlaps = (e: CalendarEvent) => dayEvents.some((o) => o.id !== e.id && new Date(o.start_at) < new Date(e.end_at) && new Date(e.start_at) < new Date(o.end_at));

  const dayLabel = (d: Date, i: number) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(d));

  return (
    <Page wide>
      <PageHeader title="Calendar" sub={data?.google.connected ? `Google Calendar · ${data.google.account ?? "connected"}` : "Mila's calendar"} right={<div className="flex gap-2"><button className="btn" onClick={() => setOoo(true)}><Plane size={18} />Out of office</button><button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={18} />Add</button></div>} />
      <div>
      <div className="min-w-0">
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0 lg:pb-0" role="tablist" aria-label="Days">
        {days.map((d, i) => {
          const n = byDay.get(key(d))?.length ?? 0; const p = partsIn(d, tz);
          return (
            <button key={i} role="tab" aria-selected={sel === i} onClick={() => setSel(i)} className="glass flex min-h-[44px] w-[62px] shrink-0 flex-col items-center py-3 transition lg:w-auto lg:py-2.5" style={{ borderRadius: 22, ...(sel === i ? { background: "linear-gradient(135deg,var(--accent),var(--accent-2))", color: "var(--accent-ink)", borderColor: "transparent" } : {}) }}>
              <span className="text-[11.5px] font-bold uppercase tracking-wider opacity-80">{new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d)}</span>
              <span className="display text-[28px] leading-tight">{p.d}</span>
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: n ? (sel === i ? "var(--accent-ink)" : "var(--accent)") : "transparent" }} />
            </button>
          );
        })}
      </div>
      <h2 className="h2 mb-3">{dayLabel(days[sel], sel)}</h2>
      {loading && !data ? <Skeleton className="h-40" /> : dayEvents.length ? (
        <ul className="space-y-3">
          {dayEvents.map((e) => (
            <li key={e.id}>{e.property_id || (e.location && /\d/.test(e.location)) ? (
              <div><EventPhotoCard e={e} address={e.property_id ? [data?.places[e.property_id]?.address, data?.places[e.property_id]?.city, data?.places[e.property_id]?.state].filter(Boolean).join(", ") || e.location : e.location} place={e.property_id ? data?.places[e.property_id] : null} person={e.contact_id ? data?.people[e.contact_id] : null} onMore={() => setOpenEv(e)} />{overlaps(e) && <p className="mt-1.5 px-2 text-[13px] font-semibold" style={{ color: "var(--warn)" }}>Overlaps another event</p>}</div>
            ) : <button onClick={() => setOpenEv(e)} className="glass flex w-full gap-4 p-4 text-left" style={{ borderRadius: 24 }}>
              <div className="w-[84px] shrink-0 whitespace-nowrap"><p className="font-semibold leading-tight">{fmtTime(e.start_at, tz)}</p><p className="faint mt-0.5 text-[12.5px]">{Math.round((new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000)} min</p></div>
              <div className="min-w-0 flex-1 border-l-[3px] pl-4" style={{ borderColor: KIND_COLOR[e.kind] ?? KIND_COLOR.other }}>
                <p className="font-semibold leading-snug"><span aria-hidden>{eventEmoji(e.kind)} </span>{e.title}</p>
                {e.location && <p className="faint truncate text-[13.5px]">{e.location}</p>}
                <p className="faint mt-1 text-[12px]">{syncLabel(e, { googleCalendar: !!data?.google.calendar }).text}</p>
                {overlaps(e) && <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--warn)" }}>Overlaps another event</p>}
              </div>
              <ChevronRight size={18} className="mt-1 shrink-0 text-ink-faint" aria-hidden />
            </button>}</li>
          ))}
        </ul>
      ) : <Empty title="Nothing scheduled" body="Add an event, or just tell Mila: “Schedule a showing Friday at 3.”" />}

      {dayReminders.length > 0 && (
        <div className="mt-5"><p className="kicker mb-2">Reminders</p>
          <ul className="space-y-2">{dayReminders.map((r) => (
            <li key={r.id} className="glass flex items-center gap-3 px-4 py-3" style={{ borderRadius: 20 }}><span aria-hidden>🔔</span><span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span><span className="faint shrink-0 text-[13px]">{fmtTime(r.remind_at, tz)}</span></li>
          ))}</ul>
        </div>
      )}
      <CalendarSync data={data} googleReady={!!capabilities.google} />
      </div>
      </div>
      {openEv && data && <EventDetail e={openEv} data={data} dayEvents={byDay.get(key(new Date(openEv.start_at))) ?? []} onClose={() => setOpenEv(null)} />}
      <OutOfOffice open={ooo} onClose={() => setOoo(false)} defaultDay={days[sel]} />
      <AddEvent open={adding} onClose={() => setAdding(false)} defaultDay={days[sel]} onDone={reload} />
    </Page>
  );
}

/** Pick the days and Mila does the rest through her normal time-off flow: blocks them so nothing new gets booked, warns about anything already there, offers to move it, and reminds you the evening before to wrap things up. */
function OutOfOffice({ open, onClose, defaultDay }: { open: boolean; onClose: () => void; defaultDay: Date }) {
  const { profile } = useApp();
  const router = useRouter();
  const tz = profile.timezone;
  const p = partsIn(defaultDay, tz);
  const iso = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  const [from, setFrom] = useState(iso); const [to, setTo] = useState("");
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const say = (v: string) => { const [, m, d] = v.split("-").map(Number); return `${MON[m - 1]} ${d}`; };
  const go = () => {
    const range = to && to > from ? `${say(from)} through ${say(to)}` : say(from);
    onClose();
    router.push(`/?ask=${encodeURIComponent(`I'm out of office ${range}`)}`);
  };
  return (
    <Sheet open={open} onClose={onClose} title="✈️ Out of office">
      <div className="space-y-4">
        <p className="muted text-[14.5px]">Mila blocks the time so nothing new gets booked, flags anything already on your calendar and offers to move it, and reminds you the evening before to wrap things up.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="lbl" htmlFor="ooo-from">First day off</label><input id="ooo-from" type="date" className="field" value={from} onChange={(e) => { setFrom(e.target.value); if (to && to < e.target.value) setTo(""); }} /></div>
          <div><label className="lbl" htmlFor="ooo-to">Back to work after (optional)</label><input id="ooo-to" type="date" className="field" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <button className="btn btn-primary w-full" disabled={!from} onClick={go}>Set out of office</button>
      </div>
    </Sheet>
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
        <div><label className="lbl">Location</label><PlaceInput mode="place" value={f.location} onChange={(v) => setF({ ...f, location: v })} placeholder="Address or place" /></div>
        {conflict && <div className="rounded-2xl p-3 text-[14.5px]" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)" }}><p className="font-semibold">{conflict}</p><p className="muted">I never double-book without asking.</p><button type="button" className="btn btn-sm mt-2" onClick={() => submit(true)}>Add it anyway</button></div>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Checking calendar…" : "Add event"}</button>
      </form>
    </Sheet>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex gap-4 py-3"><p className="kicker w-[84px] shrink-0 pt-[3px]">{label}</p><div className="min-w-0 flex-1 text-[15.5px] leading-snug">{children}</div></div>;
}

const KIND_LABEL: Record<string, string> = { open_house: "Open house", showing: "Showing", call: "Call", meeting: "Meeting", lunch: "Lunch", closing: "Closing", other: "Event" };

/** Clean summary of one calendar item: when, where, who, what — with the next obvious actions. */
function EventDetail({ e, data, dayEvents, onClose }: { e: CalendarEvent; data: Data; dayEvents: CalendarEvent[]; onClose: () => void }) {
  const { profile, toast } = useApp();
  const tz = profile.timezone;
  const person = e.contact_id ? data.people[e.contact_id] : null;
  const place = e.property_id ? data.places[e.property_id] : null;
  const clash = dayEvents.find((o) => o.id !== e.id && new Date(o.start_at) < new Date(e.end_at) && new Date(e.start_at) < new Date(o.end_at));
  const mins = Math.round((new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000);
  const where = e.location ?? (place ? [place.address, place.city, place.state].filter(Boolean).join(", ") : null);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(e.start_at));
  const ask = (q: string) => `/?ask=${encodeURIComponent(q)}`;
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  async function startSheet() {
    setStarting(true);
    try { const r = await jfetch<{ id: string }>("/api/showing-sheets", { method: "POST", json: { eventId: e.id } }); router.push(`/showings/${r.id}`); }
    catch (err) { toast(err instanceof Error ? err.message : "Couldn't start the sheet.", "error"); setStarting(false); }
  }
  return (
    <Sheet open onClose={onClose} title={`${eventEmoji(e.kind)} ${KIND_LABEL[e.kind] ?? "Event"}`}>
      <div>
        <p className="display text-[26px] leading-tight">{e.title}</p>
        <p className="muted mt-1">{day} · {fmtRange(e.start_at, e.end_at, tz)}</p>
        {clash && <p className="mt-3 rounded-2xl px-3.5 py-2.5 text-[14px] font-semibold" style={{ background: "color-mix(in srgb, var(--warn) 16%, transparent)", color: "var(--warn)" }}>Overlaps “{clash.title}”</p>}
        <div className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
          <DetailRow label="Length">{mins >= 60 ? `${Math.floor(mins / 60)} hr${mins % 60 ? ` ${mins % 60} min` : ""}` : `${mins} min`}</DetailRow>
          {where && <DetailRow label="Where"><p>{where}</p><a className="mt-1 inline-flex items-center gap-1 text-[14px] font-semibold text-accent" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}`}><MapPin size={14} />Directions</a></DetailRow>}
          {person && <DetailRow label="With"><Link href={`/contacts/${e.contact_id}`} className="font-semibold">{person.name}</Link><p className="muted text-[14px]">{[person.phone, person.email].filter(Boolean).join(" · ") || person.type}</p></DetailRow>}
          {place && <DetailRow label="Property"><Link href={`/properties/${e.property_id}`} className="font-semibold">{place.address}</Link><p className="muted text-[14px]">{place.verified ? [place.list_price ? `$${place.list_price.toLocaleString("en-US")}` : null, place.beds ? `${place.beds} bd` : null, place.baths ? `${place.baths} ba` : null, place.sqft ? `${place.sqft.toLocaleString("en-US")} sqft` : null].filter(Boolean).join(" · ") || "No details added yet" : "Details not verified yet"}</p></DetailRow>}
          {e.notes && <DetailRow label="Notes"><p className="whitespace-pre-line">{e.notes}</p></DetailRow>}
          <DetailRow label="Source">{e.source === "google" ? "Google Calendar" : e.synced_at ? "Mila · also in Google Calendar" : e.source === "mila" ? "Added by Mila" : "Added by you"}</DetailRow>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {e.property_id && (e.kind === "showing" || e.kind === "open_house") && <button className="btn btn-primary btn-sm" disabled={starting} onClick={startSheet}><ClipboardCheck size={16} />{starting ? "Opening…" : "Showing sheet"}</button>}
          <a className="btn btn-sm" href={`/api/calendar/event/${e.id}/ics`}><CalendarPlus size={16} />Add to my calendar</a>
          {person && <Link className="btn btn-sm" href={ask(`Draft a confirmation message to ${person.name} for ${e.title}`)}>Message {person.name.split(" ")[0]}</Link>}
          <Link className="btn btn-sm" href={ask(`Move ${e.title} to a different time`)}>Reschedule</Link>
        </div>
      </div>
    </Sheet>
  );
}

/** Put Mila's events on the agent's own calendar: Google by connecting once, Apple (and any calendar app) by subscribing with one tap. Mila only ever writes to it. */
function CalendarSync({ data, googleReady }: { data: Data | null; googleReady: boolean }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const google = !!data?.google.connected;
  async function link() { return jfetch<{ https: string; webcal: string }>("/api/calendar/feed-link"); }
  async function addApple() {
    setBusy(true);
    try { const l = await link(); window.location.href = l.webcal; }
    catch (e: any) { toast(e?.message ?? "Couldn't make your calendar link.", "error"); } finally { setBusy(false); }
  }
  async function copy() {
    try { const l = await link(); await navigator.clipboard.writeText(l.https); toast("Link copied. Paste it into any calendar app's “subscribe” option.", "success"); }
    catch { toast("Couldn't copy the link.", "error"); }
  }
  return (
    <div className="glass mt-8 space-y-4 p-5" style={{ borderRadius: 24 }}>
      <div><p className="font-semibold">📅 Get Mila's events on your phone</p><p className="muted text-[14px]">Every showing, open house and appointment Mila adds shows up in your own calendar, with the client, phone, address and notes inside. Pick the one you use.</p></div>
      <div className="flex flex-wrap items-center gap-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <ServiceLogo id="apple_calendar" size={36} />
        <p className="min-w-0 flex-1 text-[15px]"><b>Apple Calendar</b><span className="faint block text-[13.5px]">iPhone, iPad and Mac. Tap once, then Subscribe. New and changed events update by themselves.</span></p>
        <button className="btn btn-primary btn-sm" onClick={addApple} disabled={busy}>{busy ? "Opening…" : "Add to Apple Calendar"}</button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <ServiceLogo id="google_calendar" size={36} />
        <p className="min-w-0 flex-1 text-[15px]"><b>Google Calendar</b><span className="faint block text-[13.5px]">{google ? `Connected${data?.google.account ? ` as ${data.google.account}` : ""}. Mila adds each event the moment she makes it.` : googleReady ? "Connect once and approve on Google's screen. Mila adds events for you from then on." : "Not available yet."}</span></p>
        {!google && googleReady && <a className="btn btn-primary btn-sm" href="/api/integrations/google/start?services=calendar">Connect Google</a>}
        {!google && googleReady && <p className="faint w-full text-[12.5px]">Google may say Mila is not verified yet. Tap <b>Advanced</b>, then <b>Go to Mila</b>.</p>}
      </div>
      <p className="faint border-t pt-3 text-[13px]" style={{ borderColor: "var(--line)" }}>Another calendar app (Outlook, Fantastical…)? <button className="font-semibold text-accent" onClick={copy}>Copy your calendar link</button>. You can also tap any event and choose “Add to my calendar”.</p>
    </div>
  );
}
