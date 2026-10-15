"use client";
import { useEffect, useState } from "react";

interface Design { id: string; label: string; blurb: string }

/** Pick one of the countdown designs, preview it with a real name, send a test, then send to the waitlist 12 at a time. */
export function AnnouncePanel({ designs, days, pending, sent, ready, defaultEmail, smtp }: { designs: Design[]; days: number; pending: number; sent: number; ready: boolean; defaultEmail: string; smtp: boolean }) {
  const [design, setDesign] = useState(designs[0].id);
  const [name, setName] = useState("Sarah Carter");
  const [email, setEmail] = useState(defaultEmail);
  const [confirm, setConfirm] = useState("");
  const [html, setHtml] = useState(""); const [subject, setSubject] = useState("");
  const [left, setLeft] = useState(pending); const [done, setDone] = useState(sent);
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<{ ok: boolean; text: string; extra?: string[] } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/announce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "preview", design, name }) })
      .then((r) => r.json()).then((d) => { if (live && d.html) { setHtml(d.html); setSubject(d.subject); } }).catch(() => {});
    return () => { live = false; };
  }, [design, name]);
  async function call(action: "test" | "send") {
    setBusy(action); setMsg(null);
    try {
      const r = await fetch("/api/announce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, design, email, name, confirm }) });
      const d = await r.json();
      if (!r.ok) setMsg({ ok: false, text: d.error ?? "Failed." });
      else { setMsg({ ok: true, text: d.message, extra: d.failed?.length ? d.failed : undefined }); if (typeof d.remaining === "number") { setLeft(d.remaining); setDone((x) => x + (d.sent ?? 0)); } }
    } catch { setMsg({ ok: false, text: "Network error. Try again." }); }
    setBusy(null);
  }
  return (
    <div className="grid g2">
      <div className="card">
        <p className="eyebrow">1 · Pick a design</p>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {designs.map((d) => (
            <label key={d.id} style={{ display: "block", padding: "10px 12px", borderRadius: 12, border: `2px solid ${design === d.id ? "var(--accent, #7b63e8)" : "var(--line, #e6e4f2)"}`, cursor: "pointer" }}>
              <input type="radio" name="design" checked={design === d.id} onChange={() => setDesign(d.id)} style={{ marginRight: 8 }} /><b>{d.label}</b>
              <span className="mute" style={{ display: "block", fontSize: 13, marginLeft: 22 }}>{d.blurb}</span>
            </label>
          ))}
        </div>
        <p className="eyebrow" style={{ marginTop: 16 }}>2 · Preview with a name</p>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} aria-label="Preview name" />
        <p className="mute" style={{ fontSize: 13, marginTop: 6 }}>Subject: <b>{subject}</b> · {days} {days === 1 ? "day" : "days"} to launch (counted automatically).</p>
        <p className="eyebrow" style={{ marginTop: 16 }}>3 · Send yourself a test</p>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Test email" />
        <button className="btn primary" style={{ marginTop: 10 }} disabled={!smtp || !!busy} onClick={() => call("test")}>{busy === "test" ? "Sending…" : "Send test"}</button>
        <p className="eyebrow" style={{ marginTop: 16 }}>4 · Send to the waitlist</p>
        {!ready ? <div className="note warn">Run <b>0013_waitlist_announced.sql</b> in the Supabase SQL editor first, then refresh.</div> : <>
          <p className="mute" style={{ fontSize: 13, marginBottom: 8 }}><b>{done}</b> sent · <b>{left}</b> still to send. Each click sends up to 12 and never emails the same person twice.</p>
          <input className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type SEND to enable" aria-label="Type SEND to confirm" autoComplete="off" />
          <button className="btn primary" style={{ marginTop: 10 }} disabled={!smtp || !!busy || confirm !== "SEND" || left === 0} onClick={() => call("send")}>{busy === "send" ? "Sending…" : left === 0 ? "Everyone has it" : "Send next batch"}</button>
        </>}
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <iframe title="Email preview" srcDoc={html} sandbox="" style={{ width: "100%", height: 760, border: 0, background: "#fff" }} />
      </div>
      {msg && <div className={`note ${msg.ok ? "" : "warn"}`} style={{ gridColumn: "1 / -1" }} role="status">{msg.text}{msg.extra && <pre>{msg.extra.join("\n")}</pre>}</div>}
      {!smtp && <div className="note warn" style={{ gridColumn: "1 / -1" }}>Email isn&apos;t set up yet. Add SMTP_HOST, SMTP_USER and SMTP_PASS in this project&apos;s Vercel settings, then redeploy.</div>}
    </div>
  );
}
