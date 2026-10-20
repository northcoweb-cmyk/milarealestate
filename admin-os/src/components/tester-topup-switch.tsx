"use client";
import { useEffect, useState } from "react";

export function TesterTopupSwitch() {
  const [on, setOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetch("/api/tester-topup").then((r) => r.json()).then((d) => setOn(d.on !== false)).catch(() => setMsg("Couldn't read the setting.")); }, []);
  async function flip() {
    const next = !on; setMsg("");
    const r = await fetch("/api/tester-topup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: next }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setOn(next); else setMsg(d.error ?? "Couldn't save.");
  }
  return (
    <div>
      <button className="btn" disabled={on === null} onClick={flip}>{on === null ? "Loading…" : on ? "Tester auto top-up: ON (tap to turn off)" : "Tester auto top-up: OFF (tap to turn on)"}</button>
      <p className="mute" style={{ marginTop: 6 }}>{on ? "Test accounts get +3,000 credits whenever they run low, shown in their history as “Test account top-up”." : "Test accounts now run down to zero and see the out-of-credits screen, like a real user."}</p>
      {msg && <p className="mute">{msg}</p>}
    </div>
  );
}
