"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, ChevronDown, Copy, Film, Flag, ImagePlus, Share2, StickyNote, Trash2, X } from "lucide-react";
import { Confirm, Skeleton, CheckDot, jfetch } from "@/components/ui";
import { Page } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";
import { SECTIONS, allItems, progress, type CustomItem, type ItemEntry, type ItemState, type SheetData } from "@/lib/showing-sheet";
import { uploadMedia } from "@/lib/media-upload";

interface Detail {
  id: string; sheet: SheetData; property: { id: string; address: string; city: string | null; state: string | null; list_price: number | null; beds: number | null; baths: number | null; sqft: number | null; verified: boolean } | null;
  contact: { id: string; name: string } | null; event: { id: string; title: string; when: string } | null; media: Record<string, { mime: string; name: string; url: string }>; summary: string | null;
}
type Patch = { items?: Record<string, Partial<ItemEntry>>; custom?: CustomItem[]; overall_note?: string; media?: string[] };
type Filter = "all" | "todo" | "issue" | "noted";

export default function ShowingSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useApi<Detail>(`/api/showing-sheets/${id}`);
  if (loading && !data) return <Page><Skeleton className="h-48" /></Page>;
  if (!data) return <Page><p className="muted">That showing sheet couldn&apos;t be found.</p><Link className="btn mt-4" href="/showings">Back</Link></Page>;
  return <Sheet0 id={id} initial={data} />;
}

function Sheet0({ id, initial }: { id: string; initial: Detail }) {
  const { toast } = useApp();
  const [sheet, setSheet] = useState<SheetData>(initial.sheet);
  const [media, setMedia] = useState(initial.media);
  const [save, setSave] = useState<"saved" | "saving" | "offline">("saved");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<{ id: string; owner: string | null } | null>(null);
  const [finish, setFinish] = useState(false);
  const [del, setDel] = useState(false);
  const [uploads, setUploads] = useState<Record<string, number>>({});
  const pending = useRef<Patch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeKey = `mila.sheet.pending.${id}`;
  const flushRef = useRef<() => void>(() => undefined);
  const p = useMemo(() => progress(sheet), [sheet]);
  const items = useMemo(() => allItems(sheet.custom), [sheet.custom]);
  const entry = (itemId: string): ItemEntry => sheet.items[itemId] ?? { state: "todo" };

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const body = pending.current;
    if (!Object.keys(body).length) return;
    pending.current = {}; setSave("saving");
    try { await jfetch(`/api/showing-sheets/${id}`, { method: "PATCH", json: body }); try { if (!Object.keys(pending.current).length) localStorage.removeItem(storeKey); } catch { /* ignore */ } setSave(Object.keys(pending.current).length ? "saving" : "saved"); }
    catch {
      // no signal inside the house: keep the changes, retry shortly
      pending.current = mergePatch(body, pending.current); setSave("offline");
      try { localStorage.setItem(storeKey, JSON.stringify(pending.current)); } catch { /* ignore */ }
      timer.current = setTimeout(() => flushRef.current(), 8000);
    }
  }, [id, storeKey]);
  useEffect(() => { flushRef.current = () => { void flush(); }; }, [flush]);
  const queue = useCallback((patch: Patch) => {
    pending.current = mergePatch(pending.current, patch);
    try { localStorage.setItem(storeKey, JSON.stringify(pending.current)); } catch { /* ignore */ }
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }, [flush, storeKey]);
  useEffect(() => { // changes made while offline in a previous visit
    try { const raw = localStorage.getItem(storeKey); if (raw) { const pend = JSON.parse(raw) as Patch; setSheet((s) => applyPatch(s, pend)); pending.current = pend; setSave("saving"); timer.current = setTimeout(flush, 300); } } catch { /* ignore */ }
    const leave = () => { void flush(); };
    window.addEventListener("pagehide", leave); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") leave(); });
    return () => { window.removeEventListener("pagehide", leave); };
  }, [flush, storeKey]);

  const patchItem = (itemId: string, e: Partial<ItemEntry>) => { setSheet((s) => applyPatch(s, { items: { [itemId]: e } })); queue({ items: { [itemId]: e } }); };

  async function addFiles(files: FileList | null, target: { item: string | null }) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const key = `${target.item ?? "walk"}:${f.name}:${f.size}`;
      setUploads((u) => ({ ...u, [key]: 0 }));
      try {
        const m = await uploadMedia(f, { propertyId: initial.property?.id, sheetId: id }, (pct) => setUploads((u) => ({ ...u, [key]: pct })));
        setMedia((x) => ({ ...x, [m.id]: { mime: m.mime, name: m.name, url: m.url } }));
        if (target.item) { const cur = sheetRef.current.items[target.item]?.media ?? []; patchItem(target.item, { media: [...cur, m.id] }); }
        else { const next = [...sheetRef.current.media, m.id]; setSheet((s) => ({ ...s, media: next })); queue({ media: next }); }
      } catch (e) { toast(e instanceof Error ? e.message : "Couldn't upload that.", "error"); }
      finally { setUploads((u) => { const n = { ...u }; delete n[key]; return n; }); }
    }
  }
  const sheetRef = useRef(sheet); useEffect(() => { sheetRef.current = sheet; }, [sheet]);

  async function removeMedia(mid: string, owner: string | null) {
    try { await fetch(`/api/media/${mid}`, { method: "DELETE" }); } catch { /* the record may already be gone */ }
    if (owner) patchItem(owner, { media: (sheet.items[owner]?.media ?? []).filter((x) => x !== mid) });
    else { const next = sheet.media.filter((x) => x !== mid); setSheet((s) => ({ ...s, media: next })); queue({ media: next }); }
    setViewer(null);
  }
  function addCustom(section: string, label: string) {
    const c: CustomItem = { id: "x-" + Math.random().toString(36).slice(2, 9), section, label };
    const next = [...sheet.custom, c]; setSheet((s) => ({ ...s, custom: next })); queue({ custom: next });
  }

  const matches = (itemId: string) => { const e = entry(itemId); return filter === "all" || (filter === "todo" && e.state === "todo") || (filter === "issue" && e.state === "issue") || (filter === "noted" && !!(e.note?.trim() || e.media?.length)); };
  const prop = initial.property;
  const sectionDone = (key: string) => items.filter((i) => i.section === key && entry(i.id).state !== "todo").length;
  const sectionTotal = (key: string) => items.filter((i) => i.section === key).length;
  const firstOpenSection = SECTIONS.find((s) => sectionDone(s.key) < sectionTotal(s.key))?.key;
  const isOpen = (key: string) => openSec[key] ?? (filter !== "all" || key === firstOpenSection);

  return (
    <Page>
      <div className="mb-3 flex items-center justify-between">
        <Link href={prop ? `/properties/${prop.id}` : "/showings"} className="btn btn-quiet btn-sm !pl-2"><ArrowLeft size={18} />Back</Link>
        <span className="faint text-[12.5px]" aria-live="polite">{save === "saved" ? "Saved ✓" : save === "saving" ? "Saving…" : "Offline — will sync"}</span>
      </div>
      <h1 className="h1">Showing sheet</h1>
      <p className="muted mt-1">{prop ? `${prop.address}${prop.city ? `, ${prop.city}` : ""}` : "Property"}{initial.event ? ` · ${initial.event.when}` : ""}</p>
      {initial.contact && <p className="faint text-[14px]">With {initial.contact.name}</p>}

      <div className="glass mt-5 p-4" style={{ borderRadius: 24 }}>
        <div className="flex items-end justify-between"><p className="text-[15px] font-semibold">{p.done} of {p.total} checked</p><p className="faint text-[13px]">{p.issues > 0 ? `⚑ ${p.issues} flagged · ` : ""}{p.mediaCount} photos/videos</p></div>
        <div className="mt-2.5 h-2.5 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 10%, transparent)" }}><div className="h-full rounded-full transition-all duration-300" style={{ width: `${(p.done / Math.max(1, p.total)) * 100}%`, background: "var(--ok)" }} /></div>
      </div>

      <div className="no-scrollbar -mx-4 my-4 flex gap-2 overflow-x-auto px-4">
        {([["all", "Everything"], ["todo", "To do"], ["issue", `Flagged${p.issues ? ` · ${p.issues}` : ""}`], ["noted", "Notes & media"]] as [Filter, string][]).map(([k, l]) => <button key={k} className={"chip " + (filter === k ? "is-selected" : "")} onClick={() => setFilter(k)}>{l}</button>)}
      </div>

      {/* overall notes + walkthrough media */}
      <section className="glass mb-5 p-4" style={{ borderRadius: 24 }}>
        <p className="kicker mb-2">Overall notes</p>
        <textarea className="field w-full" rows={3} value={sheet.overall_note} placeholder="First impressions, who was there, what you'd tell the buyer…" onChange={(e) => { setSheet((s) => ({ ...s, overall_note: e.target.value })); queue({ overall_note: e.target.value }); }} aria-label="Overall notes" />
        <p className="kicker mb-2 mt-4">Walkthrough photos & videos</p>
        <MediaStrip ids={sheet.media} media={media} uploads={Object.entries(uploads).filter(([k]) => k.startsWith("walk:")).map(([, v]) => v)} onOpen={(mid) => setViewer({ id: mid, owner: null })} onAdd={(f) => addFiles(f, { item: null })} />
      </section>

      <div className="space-y-4">
        {SECTIONS.map((sec) => {
          const rows = items.filter((i) => i.section === sec.key && matches(i.id));
          if (filter !== "all" && !rows.length) return null;
          const d = sectionDone(sec.key), t = sectionTotal(sec.key);
          return (
            <section key={sec.key} className="glass overflow-hidden" style={{ borderRadius: 26 }}>
              <button className="flex w-full items-center gap-3 px-4 py-4 text-left" onClick={() => setOpenSec((o) => ({ ...o, [sec.key]: !isOpen(sec.key) }))} aria-expanded={isOpen(sec.key)}>
                <span className="text-[24px]" aria-hidden>{sec.emoji}</span>
                <span className="min-w-0 flex-1"><span className="block text-[17px] font-semibold leading-tight">{sec.title}</span><span className="faint block text-[13px]">{d === t ? "All checked ✓" : `${d} of ${t} · ${sec.blurb}`}</span></span>
                <ChevronDown size={20} className={"shrink-0 transition " + (isOpen(sec.key) ? "rotate-180" : "")} />
              </button>
              {isOpen(sec.key) && (
                <div>
                  <ul className="divide-y" style={{ borderTop: "1px solid var(--line)" }}>
                    {rows.map((it) => {
                      const e = entry(it.id); const expanded = open === it.id; const mcount = e.media?.length ?? 0;
                      return (
                        <li key={it.id} className="px-4 py-3" style={e.state === "issue" ? { background: "color-mix(in srgb, var(--danger) 8%, transparent)" } : undefined}>
                          <div className="flex items-start gap-3">
                            <CheckDot done={e.state === "ok"} onClick={() => patchItem(it.id, { state: e.state === "ok" ? "todo" : "ok" })} label={`Mark “${it.label}” ${e.state === "ok" ? "not checked" : "checked"}`} />
                            <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(expanded ? null : it.id)} aria-expanded={expanded}>
                              <span className={"block text-[16px] font-semibold leading-snug " + (e.state === "na" ? "line-through opacity-50" : "")}>{it.label}</span>
                              {it.hint && !expanded && <span className="faint block text-[13px] leading-snug">{it.hint}</span>}
                              {(e.note?.trim() || mcount > 0) && !expanded && <span className="muted mt-0.5 block text-[13.5px]">{e.note?.trim() ? `📝 ${e.note.trim().slice(0, 60)}${e.note.trim().length > 60 ? "…" : ""}` : ""}{mcount > 0 ? ` 📷 ${mcount}` : ""}</span>}
                            </button>
                            <button onClick={() => patchItem(it.id, { state: e.state === "issue" ? "todo" : "issue" })} aria-pressed={e.state === "issue"} aria-label={`Flag “${it.label}” as an issue`} className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ color: e.state === "issue" ? "var(--danger)" : "var(--ink-faint)", background: e.state === "issue" ? "color-mix(in srgb, var(--danger) 16%, transparent)" : "transparent" }}><Flag size={18} fill={e.state === "issue" ? "currentColor" : "none"} /></button>
                          </div>
                          {expanded && (
                            <div className="mt-3 space-y-3 pl-10">
                              {it.hint && <p className="muted text-[13.5px] leading-snug">{it.hint}</p>}
                              <div className="flex flex-wrap gap-2">
                                {(["ok", "issue", "na", "todo"] as ItemState[]).map((s) => <button key={s} onClick={() => patchItem(it.id, { state: s })} className={"chip " + (e.state === s ? "is-selected" : "")}>{{ ok: "✓ OK", issue: "⚑ Issue", na: "N/A", todo: "To do" }[s]}</button>)}
                              </div>
                              <textarea className="field w-full" rows={3} value={e.note ?? ""} placeholder="What did you see, hear or find out?" aria-label={`Notes for ${it.label}`} onChange={(ev) => patchItem(it.id, { note: ev.target.value })} />
                              <MediaStrip ids={e.media ?? []} media={media} uploads={Object.entries(uploads).filter(([k]) => k.startsWith(it.id + ":")).map(([, v]) => v)} onOpen={(mid) => setViewer({ id: mid, owner: it.id })} onAdd={(f) => addFiles(f, { item: it.id })} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {filter === "all" && <AddCustom onAdd={(label) => addCustom(sec.key, label)} />}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="faint mt-5 px-1 text-[12.5px] leading-snug">A buyer&apos;s walkthrough guide — not a home inspection. Hire a licensed inspector before you buy.</p>
      <button className="btn btn-primary mt-5 w-full" onClick={async () => { await flush(); setFinish(true); }}>{sheet.status === "complete" ? "View saved summary" : "Finish & save to notes"}</button>
      <button className="btn btn-quiet mt-2 w-full text-[color:var(--danger)]" onClick={() => setDel(true)}><Trash2 size={16} />Delete this sheet</button>

      {viewer && <Viewer m={media[viewer.id]} onClose={() => setViewer(null)} onDelete={() => removeMedia(viewer.id, viewer.owner)} />}
      {finish && <FinishSheet detail={initial} sheet={sheet} id={id} onClose={() => setFinish(false)} onSaved={(s) => setSheet((x) => ({ ...x, status: s.status, completed_at: s.completed_at }))} />}
      <Confirm open={del} danger title="Delete this showing sheet?" body="The checklist, notes, photos and videos on it will be deleted. This can't be undone." confirmLabel="Delete" onClose={() => setDel(false)} onConfirm={async () => { try { await jfetch(`/api/showing-sheets/${id}?confirm=1`, { method: "DELETE" }); window.location.assign(prop ? `/properties/${prop.id}` : "/showings"); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete.", "error"); } }} />
    </Page>
  );
}

function applyPatch(s: SheetData, patch: Patch): SheetData {
  const items = { ...s.items };
  for (const [id, e] of Object.entries(patch.items ?? {})) items[id] = { ...(items[id] ?? { state: "todo" as ItemState }), ...e } as ItemEntry;
  return { ...s, items, custom: patch.custom ?? s.custom, overall_note: patch.overall_note ?? s.overall_note, media: patch.media ?? s.media };
}
function mergePatch(a: Patch, b: Patch): Patch {
  const items: Record<string, Partial<ItemEntry>> = { ...(a.items ?? {}) };
  for (const [id, e] of Object.entries(b.items ?? {})) items[id] = { ...(items[id] ?? {}), ...e };
  return { ...a, ...b, ...(Object.keys(items).length ? { items } : {}) };
}

function MediaStrip({ ids, media, uploads, onOpen, onAdd }: { ids: string[]; media: Detail["media"]; uploads: number[]; onOpen: (id: string) => void; onAdd: (f: FileList | null) => void }) {
  const cam = useRef<HTMLInputElement>(null), vid = useRef<HTMLInputElement>(null), lib = useRef<HTMLInputElement>(null);
  return (
    <div>
      {(ids.length > 0 || uploads.length > 0) && (
        <div className="no-scrollbar -mx-1 mb-2.5 flex gap-2 overflow-x-auto px-1 py-1">
          {ids.map((mid) => { const m = media[mid]; if (!m) return null; return (
            <button key={mid} onClick={() => onOpen(mid)} className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl" aria-label={m.mime.startsWith("video/") ? "Open video" : "Open photo"}>
              {m.mime.startsWith("video/")
                ? <><video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" /><span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white"><Film size={22} /></span></>
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />}
            </button>); })}
          {uploads.map((pct, i) => <div key={i} className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl text-[13px] font-semibold" style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)" }}>{pct < 100 ? `${pct}%` : "…"}</div>)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={() => cam.current?.click()}><Camera size={16} />Photo</button>
        <button className="btn btn-sm" onClick={() => vid.current?.click()}><Film size={16} />Video</button>
        <button className="btn btn-quiet btn-sm" onClick={() => lib.current?.click()}><ImagePlus size={16} />Library</button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
      <input ref={vid} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
      <input ref={lib} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function AddCustom({ onAdd }: { onAdd: (label: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="flex gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--line)" }} onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV(""); } }}>
      <input className="field !min-h-[44px] flex-1" value={v} onChange={(e) => setV(e.target.value)} placeholder="Add your own check…" maxLength={120} aria-label="Add your own check" />
      <button className="btn btn-sm" disabled={!v.trim()}>Add</button>
    </form>
  );
}

function Viewer({ m, onClose, onDelete }: { m?: { mime: string; name: string; url: string }; onClose: () => void; onDelete: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  if (!m) return null;
  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label="Media">
      <div className="flex items-center justify-between p-4 text-white"><button className="btn btn-sm !bg-white/15 !text-white" onClick={onDelete}><Trash2 size={16} />Delete</button><button className="btn btn-sm !bg-white/15 !text-white" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {m.mime.startsWith("video/") ? <video src={m.url} controls playsInline autoPlay className="max-h-full max-w-full rounded-xl" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={m.url} alt="" className="max-h-full max-w-full rounded-xl object-contain" />}
      </div>
    </div>
  );
}

function FinishSheet({ detail, sheet, id, onClose, onSaved }: { detail: Detail; sheet: SheetData; id: string; onClose: () => void; onSaved: (s: SheetData) => void }) {
  const { toast } = useApp();
  const [toContact, setToContact] = useState(!!detail.contact);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(detail.summary);
  const p = progress(sheet);
  const items = allItems(sheet.custom);
  const flagged = items.filter((i) => sheet.items[i.id]?.state === "issue");
  async function saveNotes() {
    setBusy(true);
    try { const r = await jfetch<{ sheet: SheetData; summary: string }>(`/api/showing-sheets/${id}`, { method: "PATCH", json: { status: "complete", saveToContact: toContact } }); setText(r.summary); onSaved(r.sheet); toast(toContact && detail.contact ? `Saved to notes and ${detail.contact.name}'s profile.` : "Saved to notes.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save.", "error"); } finally { setBusy(false); }
  }
  async function share() { if (!text) return; try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast("Summary copied.", "success"); } } catch { /* cancelled */ } }
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Finish showing sheet">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="surface relative max-h-[92svh] w-full overflow-y-auto p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-lg" style={{ borderRadius: 32, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div className="mb-3 flex items-center justify-between"><h2 className="h2">{sheet.status === "complete" ? "Saved to notes ✓" : "Save this showing"}</h2><button className="btn btn-quiet btn-sm !px-2" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="glass py-3" style={{ borderRadius: 18 }}><p className="display text-[28px] leading-none">{p.done}<span className="faint text-[16px]">/{p.total}</span></p><p className="faint mt-1 text-[12px]">checked</p></div>
          <div className="glass py-3" style={{ borderRadius: 18 }}><p className="display text-[28px] leading-none" style={p.issues ? { color: "var(--danger)" } : undefined}>{p.issues}</p><p className="faint mt-1 text-[12px]">flagged</p></div>
          <div className="glass py-3" style={{ borderRadius: 18 }}><p className="display text-[28px] leading-none">{p.mediaCount}</p><p className="faint mt-1 text-[12px]">photos/videos</p></div>
        </div>
        {flagged.length > 0 && <div className="mt-4"><p className="kicker mb-2">Needs attention</p><ul className="space-y-1.5">{flagged.map((i) => <li key={i.id} className="text-[15px] leading-snug">⚑ <b>{i.label}</b>{sheet.items[i.id]?.note ? <span className="muted"> — {sheet.items[i.id]?.note}</span> : null}</li>)}</ul></div>}
        {sheet.status !== "complete" && detail.contact && <label className="mt-4 flex items-center gap-3 text-[15px]"><input type="checkbox" checked={toContact} onChange={(e) => setToContact(e.target.checked)} /> Also add to {detail.contact.name}&apos;s notes</label>}
        {sheet.status !== "complete" && <button className="btn btn-primary mt-5 w-full" disabled={busy} onClick={saveNotes}>{busy ? "Saving…" : "Save to notes"}</button>}
        {text && <div className="mt-4 flex gap-2"><button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(text); toast("Summary copied.", "success"); }}><Copy size={15} />Copy summary</button><button className="btn btn-sm" onClick={share}><Share2 size={15} />Share</button></div>}
        {sheet.status === "complete" && <button className="btn btn-quiet mt-3 w-full" onClick={async () => { await jfetch(`/api/showing-sheets/${id}`, { method: "PATCH", json: { status: "in_progress" } }); onSaved({ ...sheet, status: "in_progress", completed_at: null }); }}><StickyNote size={16} />Reopen to keep editing</button>}
        <p className="faint mt-3 text-[12.5px]">The checklist, your notes and every photo and video stay saved on this property.</p>
      </div>
    </div>
  );
}
