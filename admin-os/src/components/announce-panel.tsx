"use client";
import { useEffect, useState } from "react";

interface Design { id: string; label: string; blurb: string }

/** Preview the countdown email with a real name, send yourself a test, tick the approval, then send to everyone on the waitlist who hasn't had it. */
export function AnnouncePanel({ designs, days, pending, sent, ready, defaultEmail, smtp }: { designs: Design[]; days: number; pending: number; sent: number; ready: boolean; defaultEmail: string; smtp: boolean }) {
  const design = designs[0].id;
  const [name, setName] = useState("Sarah Carter");
  const [email, setEmail] = useState(defaultEmail);
  const [confirm, setConfirm] = useState(""); const [approved, setApproved] = useState(false);
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
    setBusy(action); setMsg({ ok: true, text: action === "send" ? "Starting… sending the first group." : "Sending the test…" });
    try {
      let total = 0; const failedAll: string[] = [];
      for (let round = 0; round < 60; round++) {
        const r = await fetch("/api/announce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, design, email, name, confirm }) });
        const d = await r.json();
        if (!r.ok) { setMsg({ ok: false, text: `${total ? `Sent ${total} before this stopped. ` : ""}${d.error ?? "Failed."}`, extra: failedAll.length ? failedAll : undefined }); setBusy(null); return; }
        if (action === "test") { setMsg({ ok: true, text: d.message }); setBusy(null); return; }
        total += d.sent ?? 0; failedAll.push(...(d.failed ?? []));
        setLeft(d.remaining ?? 0); setDone((x) => x + (d.sent ?? 0));
        setMsg({ ok: true, text: `Sending… ${total} sent so far, ${d.remaining ?? 0} to go.`, extra: failedAll.length ? failedAll : undefined });
        if (!d.remaining || !d.sent) break; // finished, or nothing went through this round (stop instead of looping)
      }
      setMsg({ ok: true, text: `Done. ${total} sent.`, extra: failedAll.length ? failedAll : undefined });
    } catch { setMsg({ ok: false, text: "Network error. Check the numbers above, then click again to continue where it stopped." }); }
    setBusy(null);
  }
  return (
    <div className="grid g2">
      <div className="card">
        <p className="eyebrow">1 · The design</p>
        <p style={{ margin: "6px 0 0" }}><b>{designs[0].label}</b><span className="mute" style={{ display: "block", fontSize: 13 }}>{designs[0].blurb}</span></p>
        <p className="eyebrow" style={{ marginTop: 16 }}>2 · Preview with a name</p>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} aria-label="Preview name" />
        <p className="mute" style={{ fontSize: 13, marginTop: 6 }}>Subject: <b>{subject}</b> · {days} {days === 1 ? "day" : "days"} to launch (counted automatically).</p>
        <p className="eyebrow" style={{ marginTop: 16 }}>3 · Send yourself a test</p>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Test email" />
        <button className="btn primary" style={{ marginTop: 10 }} disabled={!smtp || !!busy} onClick={() => call("test")}>{busy === "test" ? "Sending…" : "Send test"}</button>
        <p className="eyebrow" style={{ marginTop: 16 }}>4 · Send to the waitlist (when you&apos;re ready)</p>
        {!ready ? <div className="note warn">Run <b>0013_waitlist_announced.sql</b> in the Supabase SQL editor first, then refresh.</div> : <>
          <p className="mute" style={{ fontSize: 13, marginBottom: 8 }}><b>{done}</b> sent · <b>{left}</b> still to send. One click sends to everyone on the waitlist right now who hasn&apos;t had it (people who already made an account are skipped), and never emails the same person twice.</p>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10, fontSize: 14 }}><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} style={{ marginTop: 3 }} />I&apos;ve looked at the preview and the test email, and I approve this design.</label>
          <input className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type SEND to enable" aria-label="Type SEND to confirm" autoComplete="off" />
          <button className="btn primary" style={{ marginTop: 10 }} disabled={!smtp || !!busy || !approved || confirm !== "SEND" || left === 0} onClick={() => call("send")}>{busy === "send" ? "Sending… keep this page open" : left === 0 ? "Everyone has it" : `Send to ${left} ${left === 1 ? "person" : "people"}`}</button>
        </>}
        {msg && <div className={`note ${msg.ok ? "" : "warn"}`} style={{ marginTop: 12 }} role="status" aria-live="polite">{msg.text}{msg.extra && <pre>{msg.extra.join("\n")}</pre>}</div>}
        {busy === "send" && <p className="mute" style={{ fontSize: 13, marginTop: 8 }}>Working. This sends in small groups, so it takes a minute. Don&apos;t click again, and keep this page open.</p>}
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <iframe title="Email preview" srcDoc={html} sandbox="" style={{ width: "100%", height: 760, border: 0, background: "#fff" }} />
      </div>
      {!smtp && <div className="note warn" style={{ gridColumn: "1 / -1" }}>Email isn&apos;t set up yet. Add SMTP_HOST, SMTP_USER and SMTP_PASS in this project&apos;s Vercel settings, then redeploy.</div>}
    </div>
  );
}
