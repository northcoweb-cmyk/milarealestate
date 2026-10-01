"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Trash2 } from "lucide-react";
import type { CalendarEvent, Property, PropertyImage } from "@/lib/types";
import { Empty, PageHeader, Pill, Skeleton, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>();
  if (id === "all") return <PropertyList />;
  return <PropertyDetail id={id} />;
}

function PropertyList() {
  const { data, loading } = useApi<{ properties: Property[] }>("/api/properties");
  return (
    <Page>
      <Link href="/more" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />More</Link>
      <PageHeader title="Properties" sub="Mila only uses facts you've confirmed." />
      {loading && !data ? <Skeleton className="h-40" /> : !data?.properties.length ? <Empty title="No properties yet" body="They're created automatically when you tell Mila about an open house, showing or listing." /> : (
        <ul className="glass divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>{data.properties.map((p) => <li key={p.id}><Link href={`/properties/${p.id}`} className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/30"><div className="min-w-0 flex-1"><p className="font-semibold">{p.address}</p><p className="faint text-[13.5px]">{[p.city, p.state].filter(Boolean).join(", ") || "Details not added yet"}</p></div>{p.is_demo && <Pill>Demo</Pill>}<Pill tone={p.verified ? "ok" : "warn"}>{p.verified ? "Verified facts" : "Unverified"}</Pill></Link></li>)}</ul>
      )}
    </Page>
  );
}

function PropertyDetail({ id }: { id: string }) {
  const { data, loading, reload } = useApi<{ property: Property; images: PropertyImage[]; events: CalendarEvent[] }>(`/api/properties/${id}`);
  const { toast } = useApp();
  const [f, setF] = useState({ city: "", state: "", zip: "", county: "", list_price: "", beds: "", baths: "", sqft: "", listing_url: "", verified: false });
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const p = data?.property; if (p) setF({ city: p.city ?? "", state: p.state ?? "", zip: p.zip ?? "", county: p.county ?? "", list_price: p.list_price?.toString() ?? "", beds: p.beds?.toString() ?? "", baths: p.baths?.toString() ?? "", sqft: p.sqft?.toString() ?? "", listing_url: p.listing_url ?? "", verified: p.verified }); }, [data]);
  if (loading && !data) return <Page><Skeleton className="h-64" /></Page>;
  if (!data) return <Page><p className="muted">That property couldn't be found.</p></Page>;
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[^\d.]/g, "")));
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await jfetch(`/api/properties/${id}`, { method: "PATCH", json: { city: f.city || null, state: f.state || null, zip: f.zip || null, county: f.county || null, list_price: num(f.list_price), beds: num(f.beds), baths: num(f.baths), sqft: num(f.sqft), listing_url: f.listing_url || null, verified: f.verified } }); toast("Saved.", "success"); reload(); }
    catch (er) { toast(er instanceof Error ? er.message : "Couldn't save.", "error"); } finally { setBusy(false); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return; setBusy(true);
    try { const fd = new FormData(); for (const x of Array.from(files)) fd.append("file", x); fd.append("propertyId", id); await jfetch("/api/upload", { method: "POST", body: fd }); reload(); toast("Photos added.", "success"); }
    catch (er) { toast(er instanceof Error ? er.message : "Upload failed.", "error"); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  const p = data.property;
  return (
    <Page>
      <Link href="/properties/all" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />Properties</Link>
      <PageHeader title={p.address} sub={p.is_demo ? "Fictional demo property" : undefined} />
      <section className="glass mb-5 p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between"><p className="kicker">Photos</p><button className="btn btn-sm" onClick={() => ref.current?.click()} disabled={busy}><ImagePlus size={16} />Upload photos</button></div>
        <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        {data.images.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{data.images.map((im) => <div key={im.id} className="relative aspect-[4/3] overflow-hidden rounded-2xl">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={im.url} alt={im.caption ?? `Photo of ${p.address}`} className="h-full w-full object-cover" loading="lazy" /><button className="absolute right-2 top-2 rounded-full bg-black/45 p-1.5 text-white" aria-label="Remove photo" onClick={() => jfetch(`/api/properties/${id}/images?imageId=${im.id}`, { method: "DELETE" }).then(reload)}><Trash2 size={14} /></button></div>)}</div>
          : <p className="muted text-[14.5px]">No photos yet. Mila never uses stock or placeholder images for a real property — upload yours and they'll appear in social posts. (Listing sites aren't scraped.)</p>}
      </section>
      <form onSubmit={save} className="glass p-5 sm:p-6">
        <p className="kicker mb-1">Facts</p><p className="muted mb-4 text-[14px]">Mila only puts price, beds, baths and size in emails and posts after you confirm they're accurate.</p>
        <div className="grid gap-3 sm:grid-cols-3"><div><label className="lbl">City</label><input className="field" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div><div><label className="lbl">State</label><input className="field" maxLength={2} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase() })} /></div><div><label className="lbl">ZIP</label><input className="field" value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} /></div></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4"><div><label className="lbl">Price</label><input className="field" inputMode="numeric" value={f.list_price} onChange={(e) => setF({ ...f, list_price: e.target.value })} /></div><div><label className="lbl">Beds</label><input className="field" inputMode="decimal" value={f.beds} onChange={(e) => setF({ ...f, beds: e.target.value })} /></div><div><label className="lbl">Baths</label><input className="field" inputMode="decimal" value={f.baths} onChange={(e) => setF({ ...f, baths: e.target.value })} /></div><div><label className="lbl">Sq ft</label><input className="field" inputMode="numeric" value={f.sqft} onChange={(e) => setF({ ...f, sqft: e.target.value })} /></div></div>
        <div className="mt-3"><label className="lbl">Listing link (for your reference)</label><input className="field" type="url" value={f.listing_url} onChange={(e) => setF({ ...f, listing_url: e.target.value })} placeholder="https://" /></div>
        <label className="mt-4 flex items-center gap-3 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} /><span><b>I've confirmed these facts are accurate</b><span className="faint block text-[13px]">Required before Mila uses them in communications.</span></span></label>
        <button className="btn btn-primary mt-5" disabled={busy}>Save</button>
      </form>
      {data.events.length > 0 && <section className="mt-5"><p className="kicker mb-2">Events</p><ul className="space-y-2">{data.events.map((e) => <li key={e.id} className="glass px-4 py-3" style={{ borderRadius: 20 }}><b>{e.title}</b><span className="muted ml-2 text-[14px]">{new Date(e.start_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></li>)}</ul></section>}
    </Page>
  );
}
