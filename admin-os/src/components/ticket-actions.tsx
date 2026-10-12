"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Reply by email and resolve, right on the ticket. */
export function TicketActions({ id, status, email, canReply }: { id: string; status: string; email?: string; canReply: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  async function reply() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/support-reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, text }) });
      const d = await r.json();
      if (!r.ok) setMsg({ t: d.error ?? "Didn't send.", ok: false }); else { setText(""); setMsg({ t: d.warning ?? `Sent to ${email}.`, ok: true }); router.refresh(); }
    } catch { setMsg({ t: "Network error.", ok: false }); } finally { setBusy(false); }
  }
  async function setStatus(s: string) {
    setBusy(true);
    try { await fetch("/api/support-status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status: s }) }); router.refresh(); } finally { setBusy(false); }
  }
  return (
    <div className="reply">
      {canReply && <>
        <textarea className="field area" rows={4} placeholder={`Reply to ${email ?? "the customer"} by email…`} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row">
          <button className="btn primary" disabled={busy || text.trim().length < 2} onClick={reply}>{busy ? "Sending…" : "Send reply"}</button>
          {status !== "resolved" ? <button className="btn" disabled={busy} onClick={() => setStatus("resolved")}>Mark resolved</button> : <button className="btn" disabled={busy} onClick={() => setStatus("open")}>Reopen</button>}
          {msg && <span className={msg.ok ? "ok-t" : "err"}>{msg.t}</span>}
        </div>
      </>}
    </div>
  );
}
