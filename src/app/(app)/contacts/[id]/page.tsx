"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Mail, Pencil, Phone, Sparkles, Trash2 } from "lucide-react";
import type { Contact, ContactEvent, ContactNote, EmailDraft, Memory, Task } from "@/lib/types";
import { CONTACT_STATUSES, CONTACT_TYPES } from "@/lib/types";
import { Avatar, Confirm, Pill, Sheet, Skeleton, jfetch } from "@/components/ui";
import { Page, STATUS_LABEL, TYPE_LABEL, ago, money } from "@/components/page";
import { useApi } from "@/components/use-api";
import { useApp } from "@/components/app-context";

interface Detail { contact: Contact; facts: string[]; memories: Memory[]; timeline: ContactEvent[]; notes: ContactNote[]; tasks: Task[]; drafts: EmailDraft[] }

const ICON: Record<string, string> = { added: "＋", email_sent: "✉︎", showing: "⌂", status_changed: "↻", note: "✎", import: "⇪", calendar_added: "◷", calendar_changed: "◷", calendar_cancelled: "◷", task_done: "✓" };

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useApp();
  const { data, loading, reload } = useApi<Detail>(`/api/contacts/${id}`);
  const [edit, setEdit] = useState(false); const [del, setDel] = useState(false); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  if (loading && !data) return <Page><Skeleton className="mb-4 h-28" /><Skeleton className="h-64" /></Page>;
  if (!data) return <Page><p className="muted">That contact couldn't be found.</p><Link className="btn mt-4" href="/contacts">Back to contacts</Link></Page>;
  const c = data.contact;
  const patch = async (p: Record<string, unknown>) => { try { await jfetch(`/api/contacts/${id}`, { method: "PATCH", json: p }); await reload(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save.", "error"); } };

  return (
    <Page>
      <Link href="/contacts" className="btn btn-quiet btn-sm mb-3 !pl-2"><ArrowLeft size={18} />Contacts</Link>
      <div className="glass-strong mb-5 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <Avatar name={c.name} color={c.avatar_color} size={64} />
          <div className="min-w-0 flex-1"><h1 className="display text-[34px] leading-none">{c.name}</h1><div className="mt-2 flex flex-wrap gap-2"><Pill tone="accent">{TYPE_LABEL[c.type]}</Pill><Pill tone={c.status === "inactive" ? "neutral" : "ok"}>{STATUS_LABEL[c.status]}</Pill>{c.tags.slice(0, 3).map((t) => <Pill key={t}>{t}</Pill>)}</div></div>
          <button className="btn btn-sm" onClick={() => setEdit(true)}><Pencil size={15} />Edit</button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {c.phone && <a className="btn btn-sm" href={`tel:${c.phone}`}><Phone size={16} />{c.phone}</a>}
          {c.email && <a className="btn btn-sm" href={`mailto:${c.email}`}><Mail size={16} />{c.email}</a>}
          <Link className="btn btn-primary btn-sm" href={`/?ask=${encodeURIComponent(`Draft a follow-up email to ${c.name}`)}`}><Sparkles size={16} />Ask Mila</Link>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="glass p-5">
          <p className="kicker mb-3">Details</p>
          <dl className="space-y-2.5 text-[15px]">
            {([["Budget", c.budget_max ? `${c.budget_min ? money(c.budget_min) + " – " : "~"}${money(c.budget_max)}` : ""], ["Location", c.location], ["Timeline", c.timeline], ["Bedrooms", c.preferences.beds_min ? `${c.preferences.beds_min}+` : ""], ["Wants", (c.preferences.features ?? []).join(", ")], ["Last contact", ago(c.last_contact_at)], ["Source", c.source]] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="faint">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
          </dl>
          {c.next_action && <div className="hairline mt-4 pt-3"><p className="kicker mb-1">Next action</p><p className="font-medium">{c.next_action}</p></div>}
        </section>

        <section className="glass p-5">
          <div className="mb-3 flex items-center justify-between"><p className="kicker">What Mila remembers</p><Link href="/memory" className="text-[13px] font-semibold text-accent">Manage</Link></div>
          {data.facts.length ? <ul className="space-y-2">{data.facts.map((f, i) => <li key={i} className="flex gap-2.5 text-[15px]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />{f}</li>)}</ul> : <p className="muted text-[14.5px]">Nothing saved yet. Tell Mila what {c.name.split(" ")[0]} wants and I'll keep it.</p>}
        </section>
      </div>

      {data.tasks.length > 0 && <section className="glass mt-5 p-5"><p className="kicker mb-3">Open tasks</p><ul className="space-y-2">{data.tasks.map((t) => <li key={t.id} className="flex items-center gap-3"><button className="h-6 w-6 shrink-0 rounded-full border-2" style={{ borderColor: "var(--ink-faint)" }} aria-label={`Complete ${t.title}`} onClick={async () => { await jfetch(`/api/tasks/${t.id}`, { method: "PATCH", json: {} }); reload(); }} /><span className="min-w-0 flex-1"><span className="block font-medium">{t.title}</span>{t.subtitle && <span className="faint text-[13.5px]">{t.subtitle}</span>}</span></li>)}</ul></section>}

      <section className="glass mt-5 p-5">
        <p className="kicker mb-3">Notes</p>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; setBusy(true); await patch({ addNote: note.trim() }); setNote(""); setBusy(false); }}>
          <input className="field" placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Add a note" /><button className="btn btn-primary" disabled={busy || !note.trim()}>Add</button>
        </form>
        {c.notes && <p className="muted mt-3 whitespace-pre-line text-[14.5px]">{c.notes}</p>}
        <ul className="mt-3 space-y-2">{data.notes.map((n) => <li key={n.id} className="rounded-2xl p-3 text-[14.5px]" style={{ background: "color-mix(in srgb, var(--ink) 5%, transparent)" }}>{n.body}<span className="faint ml-2 text-[12px]">{ago(n.created_at)}</span></li>)}</ul>
      </section>

      <section className="glass mt-5 p-5">
        <p className="kicker mb-4">Timeline</p>
        {data.timeline.length ? <ol className="relative space-y-5 border-l-2 pl-6" style={{ borderColor: "color-mix(in srgb, var(--accent) 30%, transparent)" }}>
          {data.timeline.map((e) => (
            <li key={e.id} className="relative"><span className="absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "var(--glass-strong)", border: "2px solid var(--accent)", color: "var(--accent)" }}>{ICON[e.kind] ?? "•"}</span>
              <p className="faint text-[12.5px] font-semibold">{new Date(e.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: new Date(e.occurred_at).getFullYear() === new Date().getFullYear() ? undefined : "numeric" })}</p>
              <p className="font-semibold leading-snug">{e.title}</p>{e.detail && <p className="muted text-[14px]">{e.detail}</p>}</li>
          ))}
        </ol> : <p className="muted">Nothing yet.</p>}
      </section>

      <div className="mt-8 flex justify-center"><button className="btn btn-quiet btn-sm" style={{ color: "var(--danger)" }} onClick={() => setDel(true)}><Trash2 size={16} />Delete contact</button></div>

      <EditSheet open={edit} onClose={() => setEdit(false)} c={c} onSave={async (p) => { await patch(p); setEdit(false); toast("Saved.", "success"); }} />
      <Confirm open={del} danger title={`Delete ${c.name}?`} body="This permanently removes their profile, notes, timeline and memories. It can't be undone." confirmLabel="Delete" busy={busy}
        onClose={() => setDel(false)} onConfirm={async () => { setBusy(true); try { await jfetch(`/api/contacts/${id}?confirm=1`, { method: "DELETE" }); toast("Deleted.", "success"); router.replace("/contacts"); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete.", "error"); setBusy(false); } }} />
    </Page>
  );
}

function EditSheet({ open, onClose, c, onSave }: { open: boolean; onClose: () => void; c: Contact; onSave: (p: Record<string, unknown>) => Promise<void> }) {
  const [f, setF] = useState({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", type: c.type, status: c.status, location: c.location ?? "", budget_max: c.budget_max?.toString() ?? "", timeline: c.timeline ?? "", next_action: c.next_action ?? "", tags: c.tags.join(", ") });
  const [busy, setBusy] = useState(false);
  const s = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Sheet open={open} onClose={onClose} title="Edit contact">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave({ name: f.name, email: f.email || null, phone: f.phone || null, type: f.type, status: f.status, location: f.location || null, budget_max: f.budget_max ? Number(f.budget_max.replace(/[^\d.]/g, "")) : null, timeline: f.timeline || null, next_action: f.next_action || null, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) }); setBusy(false); }}>
        <div><label className="lbl">Name</label><input className="field" value={f.name} onChange={(e) => s("name", e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="lbl">Email</label><input type="email" className="field" value={f.email} onChange={(e) => s("email", e.target.value)} /></div><div><label className="lbl">Phone</label><input type="tel" className="field" value={f.phone} onChange={(e) => s("phone", e.target.value)} /></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="lbl">Type</label><select className="field" value={f.type} onChange={(e) => s("type", e.target.value)}>{CONTACT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></div><div><label className="lbl">Status</label><select className="field" value={f.status} onChange={(e) => s("status", e.target.value)}>{CONTACT_STATUSES.map((t) => <option key={t} value={t}>{STATUS_LABEL[t]}</option>)}</select></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="lbl">Area</label><input className="field" value={f.location} onChange={(e) => s("location", e.target.value)} /></div><div><label className="lbl">Max budget</label><input className="field" inputMode="numeric" value={f.budget_max} onChange={(e) => s("budget_max", e.target.value)} placeholder="650000" /></div></div>
        <div><label className="lbl">Timeline</label><input className="field" value={f.timeline} onChange={(e) => s("timeline", e.target.value)} placeholder="Next 3 months" /></div>
        <div><label className="lbl">Next action</label><input className="field" value={f.next_action} onChange={(e) => s("next_action", e.target.value)} /></div>
        <div><label className="lbl">Tags (comma separated)</label><input className="field" value={f.tags} onChange={(e) => s("tags", e.target.value)} /></div>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </form>
    </Sheet>
  );
}
