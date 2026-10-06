"use client";
import { useState } from "react";

export function InvitePanel({ pending, defaultEmail, smtp }: { pending: number; defaultEmail: string; smtp: boolean }) {
  const [email, setEmail] = useState(defaultEmail); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<{ ok: boolean; text: string; extra?: string[] } | null>(null);
  const [left, setLeft] = useState(pending);
  async function call(action: "test" | "send") {
    setBusy(action); setMsg(null);
    try {
      const r = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, email, confirm }) });
      const d = await r.json();
      if (!r.ok) setMsg({ ok: false, text: d.error ?? "Failed." });
      else { setMsg({ ok: true, text: d.message, extra: d.failed?.length ? d.failed : undefined }); if (typeof d.remaining === "number") setLeft(d.remaining); }
    } catch { setMsg({ ok: false, text: "Network error. Try again." }); }
    setBusy(null);
  }
  return (
    <div className="grid g2">
      <div className="card">
        <p className="eyebrow">Step 1</p><h2 style={{ marginTop: 4 }}>Send a test to yourself</h2>
        <p className="lead" style={{ marginBottom: 12 }}>Sends the real invite email to one address so you can click through the whole signup. If that address already has a Mila account, the link will say so.</p>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Test email" />
        <button className="btn primary" style={{ marginTop: 10 }} disabled={!smtp || !!busy} onClick={() => call("test")}>{busy === "test" ? "Sending…" : "Send test invite"}</button>
      </div>
      <div className="card">
        <p className="eyebrow">Step 2 · launch day</p><h2 style={{ marginTop: 4 }}>Send invites to the waitlist</h2>
        <p className="lead" style={{ marginBottom: 12 }}><b>{left}</b> {left === 1 ? "person hasn't" : "people haven't"} been invited yet. Each click sends up to 12. Click again until it says 0 left. Everyone gets their own personal link.</p>
        <input className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder='Type SEND to enable' aria-label="Type SEND to confirm" autoComplete="off" />
        <button className="btn primary" style={{ marginTop: 10 }} disabled={!smtp || !!busy || confirm !== "SEND" || left === 0} onClick={() => call("send")}>{busy === "send" ? "Sending…" : left === 0 ? "Everyone is invited" : "Send next batch"}</button>
      </div>
      {msg && <div className={`note ${msg.ok ? "" : "warn"}`} style={{ gridColumn: "1 / -1" }} role="status">{msg.text}{msg.extra && <pre>{msg.extra.join("\n")}</pre>}</div>}
      {!smtp && <div className="note warn" style={{ gridColumn: "1 / -1" }}>Email isn&apos;t set up yet. Add SMTP_HOST, SMTP_USER and SMTP_PASS (and optionally MAIL_FROM) in this project&apos;s Vercel environment variables, then redeploy.</div>}
    </div>
  );
}
