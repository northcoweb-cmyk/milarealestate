"use client";
import { useState } from "react";

/** Deletes one account and all of its data after typing the email back. The page refreshes when it's done. */
export function DeleteUserButton({ id, email }: { id: string; email: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    const typed = prompt(`This permanently deletes ${email} and everything under it (contacts, properties, chats, credits). It can't be undone.\n\nType the email to confirm:`);
    if (typed === null) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/delete-user", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, email, confirm: typed }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { window.location.reload(); return; }
      setMsg(d.error ?? "Couldn't delete.");
    } catch { setMsg("Network error."); }
    setBusy(false);
  }
  return <><button className="btn" disabled={busy} onClick={go} style={{ color: "var(--bad, #c0392b)" }}>{busy ? "Deleting…" : "Delete"}</button>{msg && <span className="mute" style={{ marginLeft: 6 }}>{msg}</span>}</>;
}
