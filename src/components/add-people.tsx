"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Link2, ListPlus, UserPlus, Sheet as SheetIcon } from "lucide-react";
import { CONTACT_TYPES } from "@/lib/types";
import { Sheet, jfetch } from "./ui";
import { useApp } from "./app-context";
import { TYPE_LABEL } from "./page";

type Mode = "menu" | "paste" | "manual" | "sheet" | "review" | "result";
interface Row { name: string | null; email: string | null; phone: string | null; notes: string | null; timeline: string | null; location: string | null; type: string | null; issues: string[]; raw?: string; existing?: { id: string; name: string } | null; on?: boolean }
interface Result { created: number; updated: number; needsClarification: any[]; skipped: number }

const Opt = ({ icon: I, title, sub, onClick, disabled, busy }: { icon: any; title: string; sub: string; onClick: () => void; disabled?: boolean; busy?: boolean }) => (
  <button disabled={disabled || busy} onClick={onClick} className="glass flex w-full items-center gap-4 p-4 text-left transition hover:bg-white/50 disabled:opacity-50" style={{ borderRadius: 22 }}>
    <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}><I size={22} /></span>
    <span><span className="block font-semibold">{title}</span><span className="muted text-[14px]">{sub}</span></span>
  </button>
);

export function AddPeople({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast, capabilities } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("menu");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [rows, setRows] = useState<Row[]>([]); const [tabs, setTabs] = useState<string[]>([]); const [tab, setTab] = useState("");
  const [m, setM] = useState({ name: "", email: "", phone: "", type: "lead", location: "" });
  const file = useRef<HTMLInputElement>(null);
  const close = () => { setMode("menu"); setText(""); setRes(null); setRows([]); setTabs([]); setTab(""); onClose(); };

  /** Reads the people from a source and shows them for review. Nothing is saved until "Add". */
  async function readPeople(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await jfetch<{ preview: Row[]; total: number }>("/api/contacts/import", { method: "POST", json: { ...body, preview: true } });
      setRows(r.preview.map((c) => ({ ...c, on: true }))); setMode("review");
    } catch (e: any) {
      if (e?.data?.code === "not_connected" || e?.data?.code === "reauth") { toast("Connect Google first in More → Connections.", "error"); router.push("/settings/connections"); }
      else toast(e instanceof Error ? e.message : "I couldn't read that.", "error");
    } finally { setBusy(false); }
  }
  async function readTabs() {
    setBusy(true);
    try {
      const r = await jfetch<{ tabs: { title: string }[] }>("/api/contacts/import", { method: "POST", json: { source: "google_sheet_tabs", url } });
      const names = r.tabs.map((t) => t.title);
      if (names.length <= 1) { setBusy(false); await readPeople({ source: "google_sheet", url, tab: names[0] }); return; }
      setTabs(names); setTab(names[0]); setBusy(false);
    } catch (e: any) {
      if (e?.data?.code === "not_connected" || e?.data?.code === "reauth") { toast("Connect Google first in More → Connections.", "error"); router.push("/settings/connections"); }
      else toast(e instanceof Error ? e.message : "I couldn't open that spreadsheet.", "error");
      setBusy(false);
    }
  }
  const edit = (i: number, patch: Partial<Row>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.on);
  async function addChosen() {
    setBusy(true);
    try {
      const force = chosen.map(({ on: _on, existing: _ex, ...c }) => ({ ...c, name: c.name?.trim() || null, email: c.email?.trim() || null, phone: c.phone?.trim() || null, issues: [] }));
      const r = await jfetch<Result>("/api/contacts/import", { method: "POST", json: { source: "text", text: "", force } });
      setRes(r); setMode("result"); onDone();
    } catch (e) { toast(e instanceof Error ? e.message : "Import failed.", "error"); } finally { setBusy(false); }
  }
  async function uploadFile(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", files[0]);
      const up = await fetch("/api/upload", { method: "POST", body: fd }); const uj = await up.json();
      if (!up.ok) throw new Error(uj.error);
      await readPeople({ source: "document", documentId: uj.documents[0].id });
    } catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); setBusy(false); }
    finally { if (file.current) file.current.value = ""; }
  }
  const [dup, setDup] = useState<{ id: string; name: string; matchedOn: string } | null>(null);
  async function addManual(e: React.FormEvent | null, force = false) {
    e?.preventDefault(); setBusy(true);
    try {
      const r = await jfetch<{ existing?: boolean; matchedOn?: string; contact: { id: string; name: string } }>("/api/contacts", { method: "POST", json: { ...m, email: m.email || null, phone: m.phone || null, location: m.location || null, force: force || undefined } });
      if (r.existing) { setDup({ id: r.contact.id, name: r.contact.name, matchedOn: r.matchedOn ?? "name" }); return; } // never say "added" when nothing was saved
      setDup(null); toast(`${m.name} added.`, "success"); onDone(); close(); setM({ name: "", email: "", phone: "", type: "lead", location: "" });
    }
    catch (er) { toast(er instanceof Error ? er.message : "Couldn't add them.", "error"); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={close} title={mode === "result" ? "All set" : mode === "review" ? "Review before adding" : "Add people"} wide={mode === "review"}>
      <input ref={file} type="file" hidden accept=".csv,.tsv,.xlsx,.xls,.txt,.pdf,image/*" onChange={(e) => uploadFile(e.target.files)} />
      {mode === "menu" && <div className="space-y-3">
        <Opt busy={busy} icon={ListPlus} title="Import contacts" sub="Paste a list or CSV — names, emails, phones" onClick={() => setMode("paste")} />
        <Opt busy={busy} icon={FileUp} title="Upload a file" sub="CSV, spreadsheet, PDF or a photo of a sign-in sheet" onClick={() => file.current?.click()} />
        <Opt busy={busy} icon={Link2} title="Import my contacts" sub={capabilities.google ? "Bring in people you already know" : "Not available right now"} onClick={() => readPeople({ source: "google_contacts" })} disabled={!capabilities.google} />
        <Opt busy={busy} icon={SheetIcon} title="From a spreadsheet" sub={capabilities.google ? "Open house sign-in sheets and more, from a link" : "Not available right now"} onClick={() => setMode("sheet")} disabled={!capabilities.google} />
        <Opt busy={busy} icon={UserPlus} title="Add manually" sub="One person at a time" onClick={() => setMode("manual")} />
        <p className="faint px-1 text-[13px]">Apple Contacts import is coming soon. For now, export from Contacts as a vCard/CSV and upload it here.</p>
      </div>}
      {mode === "paste" && <div className="space-y-3"><textarea className="field min-h-[180px]" placeholder={"Name, email, phone, notes\nJohn Smith, john@email.com, 301-555-0100, asked about financing"} value={text} onChange={(e) => setText(e.target.value)} /><p className="faint text-[13px]">If anything's unclear I'll ask instead of guessing.</p><div className="flex gap-3"><button className="btn flex-1" onClick={() => setMode("menu")}>Back</button><button className="btn btn-primary flex-1" disabled={busy || !text.trim()} onClick={() => readPeople({ source: /,.*,|\t/.test(text.split("\n")[0]) && text.split("\n").length > 1 && /name|email/i.test(text.split("\n")[0]) ? "csv" : "text", text })}>{busy ? "Reading…" : "Review"}</button></div></div>}
      {mode === "sheet" && <div className="space-y-3">
        <input className="field" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => { setUrl(e.target.value); setTabs([]); }} aria-label="Spreadsheet link" />
        <p className="faint text-[13px]">Open house sign-in sheets work great. Mila finds the name, phone and email columns, keeps the other columns as notes, and shows you everyone before anything is added.</p>
        {tabs.length > 1 && <div><p className="lbl">Which tab?</p><div className="flex flex-wrap gap-2">{tabs.map((t) => <button key={t} type="button" className="chip" aria-pressed={tab === t} style={tab === t ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined} onClick={() => setTab(t)}>{t}</button>)}</div></div>}
        <div className="flex gap-3"><button className="btn flex-1" onClick={() => setMode("menu")}>Back</button>
          {tabs.length > 1 ? <button className="btn btn-primary flex-1" disabled={busy} onClick={() => readPeople({ source: "google_sheet", url, tab })}>{busy ? "Reading…" : "Review people"}</button>
            : <button className="btn btn-primary flex-1" disabled={busy || !url.trim()} onClick={readTabs}>{busy ? "Reading…" : "Read spreadsheet"}</button>}</div>
      </div>}
      {mode === "review" && <div className="space-y-3">
        <div className="flex items-center gap-3"><p className="min-w-0 flex-1 text-[15px]"><b>{rows.length}</b> found. Untick anyone you don't want, and fix anything that's off.</p><button type="button" className="btn btn-sm" onClick={() => setRows((a) => a.map((r) => ({ ...r, on: !(a.every((x) => x.on)) })))}>{rows.every((r) => r.on) ? "Select none" : "Select all"}</button></div>
        <ul className="space-y-2.5" style={{ maxHeight: "52vh", overflowY: "auto" }}>{rows.map((r, i) => (
          <li key={i} className="glass p-3" style={{ borderRadius: 18, opacity: r.on ? 1 : 0.5 }}>
            <div className="flex items-center gap-3"><input type="checkbox" className="h-5 w-5 shrink-0" checked={!!r.on} onChange={(e) => edit(i, { on: e.target.checked })} aria-label={`Add ${r.name ?? "this person"}`} /><input className="field flex-1 !py-2" value={r.name ?? ""} placeholder="Name" aria-label="Name" onChange={(e) => edit(i, { name: e.target.value })} /></div>
            <div className="mt-2 grid grid-cols-2 gap-2"><input className="field !py-2" value={r.email ?? ""} placeholder="Email" inputMode="email" aria-label="Email" onChange={(e) => edit(i, { email: e.target.value })} /><input className="field !py-2" value={r.phone ?? ""} placeholder="Phone" inputMode="tel" aria-label="Phone" onChange={(e) => edit(i, { phone: e.target.value })} /></div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><input className="field !py-2" value={r.notes ?? ""} placeholder="Notes" aria-label="Notes" onChange={(e) => edit(i, { notes: e.target.value })} /><select className="field !py-2" value={r.type ?? "lead"} aria-label="Type" onChange={(e) => edit(i, { type: e.target.value })}>{CONTACT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}</select></div>
            {(r.existing || r.issues?.length > 0) && <p className="mt-1.5 text-[12.5px] font-semibold" style={{ color: "var(--warn)" }}>{r.existing ? `Already in your contacts as ${r.existing.name}, so this updates them.` : r.issues[0]}</p>}
          </li>))}</ul>
        <div className="flex gap-3 pt-1"><button className="btn flex-1" onClick={() => setMode("menu")}>Back</button><button className="btn btn-primary flex-1" disabled={busy || !chosen.length} onClick={addChosen}>{busy ? "Adding…" : `Add ${chosen.length} ${chosen.length === 1 ? "person" : "people"}`}</button></div>
      </div>}
      {mode === "manual" && <form onSubmit={(e) => addManual(e)} className="space-y-3">
        {dup && <div role="alert" className="rounded-2xl p-3.5 text-[14.5px]" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)" }}>
          <p className="font-semibold">{dup.name} already has this {dup.matchedOn}.</p>
          <p className="muted mt-0.5">Nothing was added yet.</p>
          <div className="mt-2.5 flex flex-wrap gap-2"><a className="btn btn-sm" href={`/contacts/${dup.id}`}>Open {dup.name.split(" ")[0]}</a><button type="button" className="btn btn-sm" disabled={busy} onClick={() => addManual(null, true)}>Add anyway</button><button type="button" className="btn btn-quiet btn-sm" onClick={() => setDup(null)}>Cancel</button></div>
        </div>}
        <div><label className="lbl" htmlFor="mn">Name</label><input id="mn" className="field" required value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="lbl" htmlFor="me">Email</label><input id="me" type="email" className="field" value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} /></div><div><label className="lbl" htmlFor="mp">Phone</label><input id="mp" type="tel" className="field" value={m.phone} onChange={(e) => setM({ ...m, phone: e.target.value })} /></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="lbl" htmlFor="mt">Type</label><select id="mt" className="field" value={m.type} onChange={(e) => setM({ ...m, type: e.target.value })}>{CONTACT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></div><div><label className="lbl" htmlFor="ml">Area</label><input id="ml" className="field" value={m.location} onChange={(e) => setM({ ...m, location: e.target.value })} /></div></div>
        <div className="flex gap-3 pt-2"><button type="button" className="btn flex-1" onClick={() => setMode("menu")}>Back</button><button className="btn btn-primary flex-1" disabled={busy}>Add</button></div>
      </form>}
      {mode === "result" && res && <div className="space-y-4">
        <p className="text-[17px]">{[res.created && `Added ${res.created} new`, res.updated && `updated ${res.updated} existing`].filter(Boolean).join(" and ") || "Nothing was added"}.</p>
        {res.needsClarification.length > 0 && <div className="glass p-4" style={{ borderRadius: 20 }}><p className="mb-2 font-semibold">{res.needsClarification.length} need a quick look</p><ul className="space-y-2">{res.needsClarification.slice(0, 8).map((c, i) => <li key={i} className="flex items-center gap-3 text-[14.5px]"><span className="min-w-0 flex-1 truncate">{c.name ?? c.email ?? c.raw ?? "Unknown"} <span className="faint">— {c.issues?.[0]}</span></span><button className="btn btn-sm" onClick={() => jfetch("/api/contacts/import", { method: "POST", json: { source: "text", text: "", force: [c] } }).then(() => { toast("Added.", "success"); onDone(); setRes({ ...res, needsClarification: res.needsClarification.filter((x) => x !== c) }); }).catch((e) => toast(e.message, "error"))}>Add anyway</button></li>)}</ul></div>}
        <button className="btn btn-primary w-full" onClick={close}>Done</button>
      </div>}
    </Sheet>
  );
}
