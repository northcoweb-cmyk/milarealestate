"use client";
import { useState } from "react";

/** Removes one person from the waitlist after a confirm. The page refreshes when it's done. */
export function DeleteWaitlistButton({ id, email }: { id: string; email: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    if (!confirm(`Remove ${email} from the waitlist? They stop getting launch emails.`)) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/waitlist-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (r.ok) { window.location.reload(); return; }
      setMsg((await r.json().catch(() => ({}))).error ?? "Couldn't remove.");
    } catch { setMsg("Network error."); }
    setBusy(false);
  }
  return <><button className="btn" disabled={busy} onClick={go} style={{ color: "var(--bad, #c0392b)" }}>{busy ? "Removing…" : "Remove"}</button>{msg && <span className="mute" style={{ marginLeft: 6 }}>{msg}</span>}</>;
}
