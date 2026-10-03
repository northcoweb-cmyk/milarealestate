"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Search, Trash2 } from "lucide-react";
import type { CalendarEvent, Property, PropertyImage } from "@/lib/types";
import { Empty, PageHeader, Pill, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { PlaceInput } from "@/components/place-input";
import { DeletePropertyConfirm } from "@/components/delete-property";
import type { LookupMemory } from "@/lib/agent/property-lookup";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>();
  if (id === "all") return <PropertyList />;
  return <PropertyDetail id={id} />;
}

function PropertyList() {
  const { data, loading, reload } = useApi<{ properties: Property[] }>("/api/properties");
  const [del, setDel] = useState<Property | null>(null);
  return (
    <Page>
      <Link href="/more" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />More</Link>
      <PageHeader title="Properties" sub="Mila only uses facts you've confirmed." />
      {loading && !data ? <Skeleton className="h-40" /> : !data?.properties.length ? <Empty title="No properties yet" body="They're created automatically when you tell Mila about an open house, showing or listing." /> : (
        <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>{data.properties.map((p) => <li key={p.id} className="flex items-center"><div className="min-w-0 flex-1"><Link href={`/properties/${p.id}`} className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/30"><div className="min-w-0 flex-1"><p className="font-semibold">{p.address}</p><p className="faint text-[13.5px]">{[p.city, p.state].filter(Boolean).join(", ") || "Details not added yet"}</p></div>{p.is_demo && <Pill>Demo</Pill>}<Pill tone={p.verified ? "ok" : "warn"}>{p.verified ? "Verified facts" : "Unverified"}</Pill></Link></div><button className="btn btn-quiet btn-sm mr-2 shrink-0 !px-2.5" aria-label={`Delete ${p.address}`} onClick={() => setDel(p)}><Trash2 size={18} /></button></li>)}</ul>
      )}
      {del && <DeletePropertyConfirm id={del.id} address={del.address} open onClose={() => setDel(null)} onDeleted={reload} />}
    </Page>
  );
}

function PropertyDetail({ id }: { id: string }) {
  const { data, loading, reload } = useApi<{ property: Property; images: PropertyImage[]; events: CalendarEvent[]; lookup: LookupMemory | null; lookupAvailable: boolean }>(`/api/properties/${id}`);
  const [delOpen, setDelOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [findMsg, setFindMsg] = useState<string | null>(null);
  const autoRan = useRef(false);
  const { toast } = useApp();
  const [f, setF] = useState({ city: "", state: "", zip: "", county: "", list_price: "", beds: "", baths: "", sqft: "", listing_url: "", verified: false });
  const [busy, setBusy] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const p = data?.property; if (p) setF({ city: p.city ?? "", state: p.state ?? "", zip: p.zip ?? "", county: p.county ?? "", list_price: p.list_price?.toString() ?? "", beds: p.beds?.toString() ?? "", baths: p.baths?.toString() ?? "", sqft: p.sqft?.toString() ?? "", listing_url: p.listing_url ?? "", verified: p.verified }); }, [data]);
  async function findHome(o: { street?: string; city?: string; state?: string; zip?: string } = {}) {
    setFinding(true); setFindMsg(null);
    try { const r = await jfetch<{ message: string }>(`/api/properties/${id}/lookup`, { method: "POST", json: o }); setFindMsg(r.message); reload(); }
    catch (er) { setFindMsg(er instanceof Error ? er.message : "Couldn't look that up."); } finally { setFinding(false); }
  }
  useEffect(() => { // first visit with a complete address and nothing looked up yet: do it for them
    const pr = data?.property;
    if (!data || !pr || autoRan.current || data.lookup != null || !data.lookupAvailable || !((pr.city && pr.state) || pr.zip)) return;
    autoRan.current = true; void findHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  if (loading && !data) return <Page><Skeleton className="h-64" /></Page>;
  if (!data) return <Page><p className="muted">That property couldn't be found.</p></Page>;
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[^\d.]/g, "")));
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await jfetch(`/api/properties/${id}`, { method: "PATCH", json: { city: f.city || null, state: f.state || null, zip: f.zip || null, county: f.county || null, list_price: num(f.list_price), beds: num(f.beds), baths: num(f.baths), sqft: num(f.sqft), listing_url: f.listing_url || null, verified: f.verified } }); toast("Saved.", "success"); reload(); }
    catch (er) { toast(er instanceof Error ? er.message : "Couldn't save.", "error"); } finally { setBusy(false); }
  }
  async function pull(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setPullMsg(null);
    try { const r = await jfetch<{ message: string; added: number }>(`/api/properties/${id}/pull-photos`, { method: "POST", json: { url: f.listing_url.trim() } }); setPullMsg(r.message); if (r.added) reload(); }
    catch (er) { setPullMsg(er instanceof Error ? er.message : "Couldn't read that link."); } finally { setBusy(false); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return; setBusy(true);
    try { const fd = new FormData(); for (const x of Array.from(files)) fd.append("file", x); fd.append("propertyId", id); await jfetch("/api/upload", { method: "POST", body: fd }); reload(); toast("Photos added.", "success"); }
    catch (er) { toast(er instanceof Error ? er.message : "Upload failed.", "error"); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  const p = data.property;
  const addrComplete = !!((p.city && p.state) || p.zip);
  return (
    <Page wide>
      <Link href="/properties/all" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />Properties</Link>
      <PageHeader title={p.address} sub={p.is_demo ? "Fictional demo property" : undefined} right={<button className="btn btn-quiet btn-sm" onClick={() => setDelOpen(true)}><Trash2 size={16} />Delete</button>} />
      <DeletePropertyConfirm id={p.id} address={p.address} open={delOpen} onClose={() => setDelOpen(false)} onDeleted={() => window.location.assign("/properties/all")} />
      <SheetsSection propertyId={id} />
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
      <div>
      <section className="glass mb-5 p-5 sm:p-6" style={{ borderRadius: 26 }}>
        <p className="kicker mb-1">Find this home</p>
        {data.lookup?.found ? (
          <>
            <p className="text-[15px] leading-snug">Found online: <b>{[data.lookup.facts?.beds && `${data.lookup.facts.beds} bd`, data.lookup.facts?.baths && `${data.lookup.facts.baths} ba`, data.lookup.facts?.sqft && `${data.lookup.facts.sqft.toLocaleString("en-US")} sq ft`, data.lookup.facts?.list_price && `$${data.lookup.facts.list_price.toLocaleString("en-US")}`].filter(Boolean).join(" · ")}</b>{data.lookup.facts?.status && data.lookup.facts.status !== "unknown" ? ` (${data.lookup.facts.status})` : ""}</p>
            <p className="muted mt-1 text-[13.5px]">I filled the form below from these sources. Listing sites can be wrong or out of date, so check them, then tick “confirmed” before Mila uses them in emails or posts.</p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13.5px]">{data.lookup.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">{(() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.title; } })()}</a>)}</p>
          </>
        ) : (
          <p className="muted text-[14px]">{!addrComplete ? "Add the city and state (or ZIP) and I'll find the home and fill in the details for you." : data.lookup ? "I couldn't find this exact home online. Check the address below, or add the details yourself." : "I'll look the address up on listing sites and fill in the details."}</p>
        )}
        <div className="mt-3"><label className="lbl">Full address</label>
          <PlaceInput mode="address" value={`${p.address}${p.city ? `, ${p.city}` : ""}${p.state ? `, ${p.state}` : ""}${p.zip ? ` ${p.zip}` : ""}`} onChange={() => undefined} placeholder="Start typing the street address…"
            onPick={(pl) => { const street = (pl.address ?? "").split(",")[0]?.trim(); void findHome({ street: street || undefined, city: pl.city ?? undefined, state: pl.state ?? undefined, zip: (/\b(\d{5})\b/.exec(pl.address ?? "")?.[1]) }); }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><button className="btn btn-sm" disabled={finding || !addrComplete} onClick={() => findHome()}>{finding ? "Searching listing sites…" : data.lookup ? "Look up again" : "Find details"}</button>{!data.lookupAvailable && <span className="faint text-[12.5px]">Online lookup isn't turned on for this server.</span>}</div>
        {findMsg && <p className="mt-3 rounded-2xl p-3 text-[14px]" style={{ background: "color-mix(in srgb, var(--ink) 6%, transparent)" }}>{findMsg}</p>}
      </section>
      <section className="glass mb-5 p-5 sm:p-6">
        <p className="kicker mb-1">Photos</p>
        <p className="muted mb-3 text-[14px]">Paste the listing link and Mila pulls the photos for you. She only uses what the page itself shares publicly, and never stock images.</p>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={pull}>
          <input className="field" type="url" inputMode="url" placeholder="https://your-brokerage.com/listing/123" value={f.listing_url} onChange={(e) => setF({ ...f, listing_url: e.target.value })} aria-label="Listing link" />
          <button className="btn btn-primary shrink-0" disabled={busy || !f.listing_url.trim()}><Search size={16} />{busy ? "Looking…" : "Find photos"}</button>
        </form>
        {pullMsg && <p className="mt-3 rounded-2xl p-3 text-[14px]" style={{ background: "color-mix(in srgb, var(--ink) 6%, transparent)" }}>{pullMsg}</p>}
        {data.images.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{data.images.map((im) => <div key={im.id} className="relative aspect-[4/3] overflow-hidden rounded-2xl">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={im.url} alt={im.caption ?? `Photo of ${p.address}`} className="h-full w-full object-cover" loading="lazy" /><button className="absolute right-2 top-2 rounded-full bg-black/45 p-1.5 text-white" aria-label="Remove photo" onClick={() => jfetch(`/api/properties/${id}/images?imageId=${im.id}`, { method: "DELETE" }).then(reload)}><Trash2 size={14} /></button>{im.caption && <span className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[10.5px] text-white">{im.caption}</span>}</div>)}</div>}
        <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        <p className="faint mt-4 text-[13px]">No luck with a link? <button type="button" className="font-semibold text-accent underline" onClick={() => ref.current?.click()} disabled={busy}>Add your own photos</button> instead. Only use photos you have the right to share.</p>
      </section>
      </div>
      <div>
      <form onSubmit={save} className="glass p-5 sm:p-6">
        <p className="kicker mb-1">Facts</p><p className="muted mb-4 text-[14px]">Mila only puts price, beds, baths and size in emails and posts after you confirm they're accurate.</p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3"><div><label className="lbl">City</label><input className="field" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div><div><label className="lbl">State</label><input className="field" maxLength={2} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase() })} /></div><div><label className="lbl">ZIP</label><input className="field" value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} /></div></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4"><div><label className="lbl">Price</label><input className="field" inputMode="numeric" value={f.list_price} onChange={(e) => setF({ ...f, list_price: e.target.value })} /></div><div><label className="lbl">Beds</label><input className="field" inputMode="decimal" value={f.beds} onChange={(e) => setF({ ...f, beds: e.target.value })} /></div><div><label className="lbl">Baths</label><input className="field" inputMode="decimal" value={f.baths} onChange={(e) => setF({ ...f, baths: e.target.value })} /></div><div><label className="lbl">Sq ft</label><input className="field" inputMode="numeric" value={f.sqft} onChange={(e) => setF({ ...f, sqft: e.target.value })} /></div></div>
        <div className="mt-3"><label className="lbl">Listing link (for your reference)</label><input className="field" type="url" value={f.listing_url} onChange={(e) => setF({ ...f, listing_url: e.target.value })} placeholder="https://" /></div>
        <label className="mt-4 flex items-center gap-3 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} /><span><b>I've confirmed these facts are accurate</b><span className="faint block text-[13px]">Required before Mila uses them in communications.</span></span></label>
        <button className="btn btn-primary mt-5" disabled={busy}>Save</button>
      </form>
      {data.events.length > 0 && <section className="mt-5"><p className="kicker mb-2">Events</p><ul className="space-y-2">{data.events.map((e) => <li key={e.id} className="glass px-4 py-3" style={{ borderRadius: 20 }}><b>{e.title}</b><span className="muted ml-2 text-[14px]">{new Date(e.start_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></li>)}</ul></section>}
      </div>
      </div>
    </Page>
  );
}

/** Showing sheets for this property: start a new one or reopen an earlier walkthrough. */
function SheetsSection({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const { toast } = useApp();
  const { data } = useApi<{ sheets: { id: string; status: string; started_at: string; completed_at: string | null; progress: { total: number; done: number; issues: number; mediaCount: number } }[] }>(`/api/showing-sheets?property=${propertyId}`);
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    try { const r = await jfetch<{ id: string }>("/api/showing-sheets", { method: "POST", json: { propertyId } }); router.push(`/showings/${r.id}`); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't start that.", "error"); setBusy(false); }
  }
  return (
    <section className="glass mb-5 p-5 sm:p-6" style={{ borderRadius: 26 }}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="kicker mb-1">Showing sheet</p><p className="muted text-[14px]">A checklist to walk the home with — notes, photos and video, saved here.</p></div>
        <button className="btn btn-primary btn-sm shrink-0" disabled={busy} onClick={start}><ClipboardCheck size={16} />{busy ? "Opening…" : "Start"}</button>
      </div>
      {!!data?.sheets.length && <ul className="mt-4 space-y-2">{data.sheets.map((s) => (
        <li key={s.id}><Link href={`/showings/${s.id}`} className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--ink) 5%, transparent)" }}>
          <span className="min-w-0"><span className="block text-[15px] font-semibold">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(s.completed_at ?? s.started_at))} · {s.status === "complete" ? "Saved" : "In progress"}</span><span className="faint block text-[13px]">{s.progress.done}/{s.progress.total} checked{s.progress.issues ? ` · ⚑ ${s.progress.issues}` : ""}{s.progress.mediaCount ? ` · 📷 ${s.progress.mediaCount}` : ""}</span></span>
        </Link></li>))}</ul>}
    </section>
  );
}
