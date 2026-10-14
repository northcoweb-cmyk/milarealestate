"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-context";
import { jfetch } from "@/components/ui";

const TOPICS: [string, string][] = [["billing", "Billing"], ["refund", "Refund request"], ["bug", "Something isn't working"], ["account", "My account"], ["question", "A question"], ["other", "Something else"]];
const MAX_FILES = 5;

/** In-app support: name and email prefilled (email can be changed), files attached, one clear promise about reply time. */
export function SupportForm() {
  const { profile, toast } = useApp();
  const params = useSearchParams();
  const [name, setName] = useState(profile.full_name ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [topic, setTopic] = useState(TOPICS.some(([k]) => k === params.get("topic")) ? params.get("topic")! : "question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<{ id: string; ticketNo: string; subject: string; status: string; at: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { jfetch<{ tickets: typeof tickets }>("/api/support").then((r) => setTickets(r.tickets)).catch(() => {}); }, [done]);

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    if (files.length + list.length > MAX_FILES) { setError(`You can attach up to ${MAX_FILES} files.`); return; }
    setUploading(true); setError(null);
    try {
      const fd = new FormData(); for (const f of Array.from(list)) fd.append("file", f);
      const r = await fetch("/api/upload", { method: "POST", body: fd }); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "That file didn't upload.");
      setFiles((x) => [...x, ...(j.documents as { id: string; name: string }[]).map((d) => ({ id: d.id, name: d.name }))]);
    } catch (e) { setError(e instanceof Error ? e.message : "That file didn't upload."); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await jfetch<{ message: string }>("/api/support", { method: "POST", json: { name, email, topic, subject, message, attachmentIds: files.map((f) => f.id) } });
      setDone(r.message); setMessage(""); setSubject(""); setFiles([]); toast("Ticket sent.", "success");
    } catch (er) { setError(er instanceof Error ? er.message : "Couldn't send that."); }
    finally { setBusy(false); }
  }

  if (done) return (
    <div className="space-y-4">
      <div className="glass-strong p-6" style={{ borderRadius: 26 }}><p className="text-[20px] font-semibold">Ticket sent</p><p className="muted mt-2 text-[15px]">{done}</p><button className="btn mt-4" onClick={() => setDone(null)}>Send another</button></div>
    </div>
  );
  return (
    <div className="space-y-6">
      <form onSubmit={send} className="glass-strong space-y-4 p-5 sm:p-6" style={{ borderRadius: 26 }}>
        <p className="muted text-[14.5px]">A person reads every ticket. <b>Replies usually take 48 to 72 hours.</b></p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="lbl" htmlFor="s-name">Your name</label><input id="s-name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></div>
          <div><label className="lbl" htmlFor="s-email">Email for our reply</label><input id="s-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
        </div>
        <div><label className="lbl" htmlFor="s-topic">What is this about?</label><select id="s-topic" className="field" value={topic} onChange={(e) => setTopic(e.target.value)}>{TOPICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="lbl" htmlFor="s-sub">Subject (optional)</label><input id="s-sub" className="field" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} /></div>
        <div><label className="lbl" htmlFor="s-msg">What happened, and what would help?</label><textarea id="s-msg" className="field" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={topic === "refund" ? "Tell us what went wrong and what you're asking for. Refunds are reviewed by a person and aren't available after 100 credits are used." : "Tell us what you were doing and what you expected."} required /></div>
        <div>
          <p className="lbl">Attach files (optional)</p>
          <input ref={input} type="file" multiple accept="image/*,application/pdf,.csv,.txt,.xlsx" className="hidden" onChange={(e) => pick(e.target.files)} />
          <button type="button" className="btn" onClick={() => input.current?.click()} disabled={uploading || files.length >= MAX_FILES}>{uploading ? "Uploading…" : "Add PDF or image"}</button>
          <p className="faint mt-1.5 text-[12.5px]">Up to {MAX_FILES} files, 12 MB each.</p>
          {files.length > 0 && <ul className="mt-2 space-y-1">{files.map((f) => <li key={f.id} className="flex items-center justify-between gap-3 text-[14px]"><span className="truncate">{f.name}</span><button type="button" className="faint underline" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>Remove</button></li>)}</ul>}
        </div>
        {error && <p role="alert" className="text-[14.5px]" style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || uploading}>{busy ? "Sending…" : "Send ticket"}</button>
      </form>
      {tickets.length > 0 && (
        <div className="glass p-5" style={{ borderRadius: 26 }}>
          <p className="mb-2 font-semibold">Your tickets</p>
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>{tickets.map((t) => <TicketRow key={t.id} t={t} />)}</ul>
        </div>
      )}
    </div>
  );
}

type TicketItem = { id: string; ticketNo: string; subject: string; status: string; at: string };
function TicketRow({ t }: { t: TicketItem }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<{ dir: "in" | "out"; at: string; text: string }[] | null>(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => jfetch<{ messages: { dir: "in" | "out"; at: string; text: string }[] }>(`/api/support/${t.id}`).then((r) => setMsgs(r.messages)).catch(() => toast("Couldn't load that ticket.", "error"));
  async function send() { setBusy(true); try { await jfetch(`/api/support/${t.id}`, { method: "POST", json: { text } }); setText(""); await load(); toast("Sent. We'll reply here within 48 to 72 hours.", "success"); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't send that.", "error"); } finally { setBusy(false); } }
  const waiting = t.status === "open";
  return (
    <li className="py-2.5">
      <button className="flex w-full items-center justify-between gap-3 text-left text-[14.5px]" onClick={() => { setOpen(!open); if (!open && !msgs) void load(); }} aria-expanded={open}>
        <span className="min-w-0"><b>{t.ticketNo}</b> <span className="muted">{t.subject}</span></span>
        <span className="faint shrink-0 text-[13px]">{new Date(t.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {t.status === "resolved" ? "Resolved" : t.status === "replied" ? "We replied" : "Waiting for a reply"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {(msgs ?? []).map((m, i) => <div key={i} className="rounded-2xl px-4 py-3 text-[14.5px]" style={{ background: m.dir === "out" ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "color-mix(in srgb, var(--ink) 6%, transparent)" }}><p className="faint mb-1 text-[12px] font-bold">{m.dir === "out" ? "Mila support" : "You"} · {new Date(m.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p><p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p></div>)}
          {!msgs && <p className="muted text-[14px]">Loading…</p>}
          <div className="space-y-2"><textarea className="field" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={waiting ? "Add more details…" : "Reply to Mila support…"} /><button className="btn btn-primary" disabled={busy || text.trim().length < 2} onClick={send}>{busy ? "Sending…" : "Send"}</button></div>
        </div>
      )}
    </li>
  );
}
