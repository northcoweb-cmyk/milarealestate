"use client";
import { useState } from "react";

/** Gives one waitlist person access now: sends them the "access granted" email with their login link. */
export function GrantButton({ id, email, disabled }: { id: string; email: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  const [msg, setMsg] = useState("");
  async function go() {
    if (!confirm(`Give ${email} access now? They'll get an email with a link to create their login.`)) return;
    setState("busy");
    try {
      const r = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "grant", id }) });
      const d = await r.json();
      setState(r.ok ? "done" : "err"); setMsg(d.message ?? d.error ?? "");
    } catch { setState("err"); setMsg("Network error."); }
  }
  if (state === "done") return <span className="mute" title={msg}>✓ Sent</span>;
  return <><button className="btn" disabled={disabled || state === "busy"} onClick={go}>{state === "busy" ? "Sending…" : "Grant access"}</button>{state === "err" && <span className="mute" style={{ marginLeft: 6 }}>{msg}</span>}</>;
}
