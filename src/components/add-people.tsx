"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Link2, ListPlus, UserPlus, Sheet as SheetIcon } from "lucide-react";
import { CONTACT_TYPES } from "@/lib/types";
import { Sheet, jfetch } from "./ui";
import { useApp } from "./app-context";
import { TYPE_LABEL } from "./page";

type Mode = "menu" | "paste" | "manual" | "sheet" | "result";
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
  const [m, setM] = useState({ name: "", email: "", phone: "", type: "lead", location: "" });
  const file = useRef<HTMLInputElement>(null);
  const close = () => { setMode("menu"); setText(""); setRes(null); onClose(); };

  async function post(body: unknown) {
    setBusy(true);
    try { const r = await jfetch<Result>("/api/contacts/import", { method: "POST", json: body }); setRes(r); setMode("result"); onDone(); }
    catch (e: any) {
      if (e?.data?.code === "not_connected" || e?.data?.code === "reauth") { toast("Connect Google first in More → Connections.", "error"); router.push("/settings/connections"); }
      else toast(e instanceof Error ? e.message : "Import failed.", "error");
    } finally { setBusy(false); }
  }
  async function uploadFile(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", files[0]);
      const up = await fetch("/api/upload", { method: "POST", body: fd }); const uj = await up.json();
      if (!up.ok) throw new Error(uj.error);
      await post({ source: "document", documentId: uj.documents[0].id });
    } catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); setBusy(false); }
    finally { if (file.current) file.current.value = ""; }
  }
  async function addManual(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await jfetch("/api/contacts", { method: "POST", json: { ...m, email: m.email || null, phone: m.phone || null, location: m.location || null } }); toast(`${m.name} added.`, "success"); onDone(); close(); setM({ name: "", email: "", phone: "", type: "lead", location: "" }); }
    catch (er) { toast(er instanceof Error ? er.message : "Couldn't add them.", "error"); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={close} title={mode === "result" ? "All set" : "Add people"}>
      <input ref={file} type="file" hidden accept=".csv,.tsv,.xlsx,.xls,.txt,.pdf,image/*" onChange={(e) => uploadFile(e.target.files)} />
      {mode === "menu" && <div className="space-y-3">
        <Opt busy={busy} icon={ListPlus} title="Import contacts" sub="Paste a list or CSV — names, emails, phones" onClick={() => setMode("paste")} />
        <Opt busy={busy} icon={FileUp} title="Upload a file" sub="CSV, spreadsheet, PDF or a photo of a sign-in sheet" onClick={() => file.current?.click()} />
        <Opt busy={busy} icon={Link2} title="Connect Google" sub={capabilities.google ? "Import from Google Contacts" : "Google isn't set up on this server yet"} onClick={() => post({ source: "google_contacts" })} disabled={!capabilities.google} />
        <Opt busy={busy} icon={SheetIcon} title="From a Google Sheet" sub={capabilities.google ? "Paste a spreadsheet link" : "Requires Google connection"} onClick={() => setMode("sheet")} disabled={!capabilities.google} />
        <Opt busy={busy} icon={UserPlus} title="Add manually" sub="One person at a time" onClick={() => setMode("manual")} />
        <p className="faint px-1 text-[13px]">Apple Contacts import is coming soon. For now, export from Contacts as a vCard/CSV and upload it here.</p>
      </div>}
      {mode === "paste" && <div className="space-y-3"><textarea className="field min-h-[180px]" placeholder={"Name, email, phone, notes\nJohn Smith, john@email.com, 301-555-0100, asked about financing"} value={text} onChange={(e) => setText(e.target.value)} /><p className="faint text-[13px]">If anything's unclear I'll ask instead of guessing.</p><div className="flex gap-3"><button className="btn flex-1" onClick={() => setMode("menu")}>Back</button><button className="btn btn-primary flex-1" disabled={busy || !text.trim()} onClick={() => post({ source: /,.*,|\t/.test(text.split("\n")[0]) && text.split("\n").length > 1 && /name|email/i.test(text.split("\n")[0]) ? "csv" : "text", text })}>{busy ? "Importing…" : "Import"}</button></div></div>}
      {mode === "sheet" && <div className="space-y-3"><input className="field" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} /><div className="flex gap-3"><button className="btn flex-1" onClick={() => setMode("menu")}>Back</button><button className="btn btn-primary flex-1" disabled={busy || !url.trim()} onClick={() => post({ source: "google_sheet", url })}>Import</button></div></div>}
      {mode === "manual" && <form onSubmit={addManual} className="space-y-3">
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
