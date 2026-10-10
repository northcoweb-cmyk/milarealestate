"use client";
import { useState } from "react";

export function TopupButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  const [msg, setMsg] = useState("");
  async function go() {
    setState("busy");
    try {
      const r = await fetch("/api/topup", { method: "POST" });
      const d = await r.json();
      setState(r.ok ? "done" : "err"); setMsg(d.message ?? d.error ?? "");
    } catch { setState("err"); setMsg("Network error."); }
  }
  return <div><button className="btn" disabled={state === "busy"} onClick={go}>{state === "busy" ? "Topping up…" : "Top up all tester credits"}</button>{msg && <p className="mute" style={{ marginTop: 6 }}>{msg}</p>}</div>;
}
