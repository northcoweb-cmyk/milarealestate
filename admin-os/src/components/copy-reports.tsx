"use client";
import { useState } from "react";

/** Copies one day's reports as a single block to paste into Claude Code. */
export function CopyReports() {
  const [msg, setMsg] = useState<string | null>(null);
  const [day, setDay] = useState("");
  async function go() {
    setMsg("Working…");
    try {
      const r = await fetch(`/api/feedback-export${day ? `?day=${day}` : ""}`);
      if (!r.ok) { setMsg("Couldn't build the file."); return; }
      const t = await r.text();
      try { await navigator.clipboard.writeText(t); setMsg(`Copied ${t.length.toLocaleString()} characters. Paste it into Claude Code.`); }
      catch { const w = window.open(); if (w) { w.document.write(`<pre style="white-space:pre-wrap">${t.replace(/</g, "&lt;")}</pre>`); } setMsg("Opened in a new tab: select all and copy."); }
    } catch { setMsg("Network error."); }
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0" }}>
      <input className="inp" type="date" aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} style={{ maxWidth: 170 }} />
      <button className="btn" onClick={go}>Copy {day ? day : "today"}&apos;s reports for Claude</button>
      {msg && <span className="mute">{msg}</span>}
    </div>
  );
}
