"use client";
import { useState } from "react";

/** One tap: give the oldest N people in the queue access (each gets the "access granted" email with their login link). */
export function GrantNext({ waiting }: { waiting: number }) {
  const [state, setState] = useState<"idle" | "busy">("idle"); const [msg, setMsg] = useState("");
  async function go(count: number) {
    if (!confirm(`Give the next ${Math.min(count, waiting)} people in the queue access now? They'll each get an email with a link to create their login.`)) return;
    setState("busy"); setMsg("");
    try {
      const r = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "grant_next", count }) });
      const d = await r.json(); setMsg(d.message ?? d.error ?? (r.ok ? "Done." : "Something went wrong."));
    } catch { setMsg("Network error."); }
    setState("idle");
  }
  return (
    <div className="card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <b>{waiting} waiting for access</b>
      {[1, 5, 10].map((n) => <button key={n} className="btn primary" disabled={state === "busy" || waiting === 0} onClick={() => go(n)}>Grant next {n}</button>)}
      {msg && <span className="mute">{msg}</span>}
    </div>
  );
}
