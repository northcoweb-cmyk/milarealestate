"use client";
import { useMemo, useState } from "react";

const ago = (iso: string | null, now: number) => {
  if (!iso) return "never";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 129600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

interface Row { id: string; email: string; name: string; ended: string | null; last: string | null; turns: number; emailed: number; lastEmail: string | null; hidden: boolean; optout: boolean }

/** Tick people, write one note ({first} becomes their first name), preview, test it on yourself, then send. */
export function LapsedPanel({ rows, now, openCount }: { rows: Row[]; now: number; openCount: number }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [subject, setSubject] = useState("A little something for you, {first}");
  const [body, setBody] = useState("Hi {first},\n\nYou tried Mila a little while ago, and I wanted to say thank you. We've added a lot since then, and I'd love for you to take another look.\n\n(Add your coupon or offer here.)\n\nRyan, Mila");
  const [email, setEmail] = useState("");
  const [html, setHtml] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; extra?: string[] } | null>(null);
  const shown = useMemo(() => rows.filter((r) => showHidden || !r.hidden), [rows, showHidden]);
  const reachable = shown.filter((r) => !r.optout);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const post = (b: object) => fetch("/api/lapsed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
  async function preview() { const { d } = await post({ action: "preview", subject, body }); if (d.html) setHtml(d.html); }
  async function test() { setBusy("test"); const { ok, d } = await post({ action: "test", subject, body, email }); setMsg({ ok, text: ok ? d.message : d.error ?? "Failed." }); setBusy(null); }
  async function send() {
    setBusy("send"); let queue = [...sel], total = 0; const failed: string[] = [];
    while (queue.length) {
      const { ok, d } = await post({ action: "send", ids: queue, subject, body, confirm });
      if (!ok) { setMsg({ ok: false, text: `${total ? `Sent ${total} before this stopped. ` : ""}${d.error ?? "Failed."}`, extra: failed.length ? failed : undefined }); setBusy(null); return; }
      total += d.sent ?? 0; failed.push(...(d.failed ?? [])); queue = d.rest ?? [];
      setMsg({ ok: true, text: `Sending… ${total} sent, ${queue.length} to go.`, extra: failed.length ? failed : undefined });
    }
    setMsg({ ok: !failed.length, text: `Done. ${total} sent${failed.length ? `, ${failed.length} did not go through (below).` : "."}`, extra: failed.length ? failed : undefined });
    setBusy(null); setConfirm(""); setSel(new Set());
  }
  async function hide(hidden: boolean) { if (!sel.size) return; await post({ action: "hide", ids: [...sel], hidden }); window.location.reload(); }
  return (
    <div className="grid g2">
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={() => setSel(new Set(reachable.map((r) => r.id)))}>Select all reachable ({reachable.length})</button>
          <button className="btn" onClick={() => setSel(new Set())}>Clear</button>
          <button className="btn" disabled={!sel.size} onClick={() => hide(true)}>Tuck away</button>
          <label className="mute" style={{ fontSize: 13 }}><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> show tucked away ({rows.length - openCount})</label>
        </div>
        <div className="tw"><table><thead><tr><th></th><th>Who</th><th>Trial ended</th><th>Last active</th><th className="n">Requests</th><th>Emailed</th></tr></thead><tbody>
          {shown.map((r) => (
            <tr key={r.id} style={r.hidden ? { opacity: 0.55 } : undefined}>
              <td><input type="checkbox" checked={sel.has(r.id)} disabled={r.optout} onChange={() => toggle(r.id)} aria-label={`Select ${r.email}`} /></td>
              <td>{r.name}<br /><span className="mute">{r.email}</span></td>
              <td>{ago(r.ended, now)}</td><td>{ago(r.last, now)}</td><td className="n">{r.turns}</td>
              <td>{r.optout ? <span className="pill bad">unsubscribed</span> : r.emailed ? <span className="mute">{r.emailed}× · {ago(r.lastEmail, now)}</span> : <span className="mute">no</span>}</td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={6} className="mute">No lapsed trials yet. People land here when their 7 days end without a plan.</td></tr>}
        </tbody></table></div>
        {showHidden && sel.size > 0 && <div style={{ padding: 12 }}><button className="btn" onClick={() => hide(false)}>Bring back to the list</button></div>}
      </div>
      <div className="card">
        <p className="eyebrow">Your note</p>
        <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
        <textarea className="field" rows={9} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" style={{ marginTop: 8 }} />
        <p className="mute" style={{ fontSize: 13, margin: "6px 0 10px" }}>Use <b>{"{first}"}</b> for their first name. A button to open Mila and an unsubscribe link are added for you.</p>
        <button className="btn" onClick={preview}>Preview</button>
        <p className="eyebrow" style={{ marginTop: 16 }}>Test on yourself</p>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your email" aria-label="Test email" />
        <button className="btn" style={{ marginTop: 8 }} disabled={!!busy || !email} onClick={test}>{busy === "test" ? "Sending…" : "Send test"}</button>
        <p className="eyebrow" style={{ marginTop: 16 }}>Send to {sel.size} {sel.size === 1 ? "person" : "people"}</p>
        <input className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type SEND to enable" aria-label="Type SEND to confirm" autoComplete="off" />
        <button className="btn primary" style={{ marginTop: 8 }} disabled={!!busy || !sel.size || confirm !== "SEND"} onClick={send}>{busy === "send" ? "Sending… keep this page open" : `Send to ${sel.size}`}</button>
        {msg && <div className={`note ${msg.ok ? "" : "warn"}`} style={{ marginTop: 12 }} role="status" aria-live="polite">{msg.text}{msg.extra && <pre>{msg.extra.join("\n")}</pre>}</div>}
        {html && <iframe title="Preview" srcDoc={html} sandbox="" style={{ width: "100%", height: 420, border: "1px solid var(--line, #333)", borderRadius: 12, marginTop: 14, background: "#fff" }} />}
      </div>
    </div>
  );
}
