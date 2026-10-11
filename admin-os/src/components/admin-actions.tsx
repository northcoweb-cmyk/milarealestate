"use client";
import { useState } from "react";

function Form({ kind, fields, cta }: { kind: "grant" | "extend-trial"; fields: { key: string; label: string; type?: string; placeholder?: string }[]; cta: string }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ busy?: boolean; msg?: string; ok?: boolean }>({});
  async function go() {
    setState({ busy: true });
    try {
      const r = await fetch(`/api/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "credits" || k === "days" ? Number(x) : x]))) });
      const d = await r.json();
      setState({ msg: d.message ?? d.error, ok: r.ok });
    } catch { setState({ msg: "Network error.", ok: false }); }
  }
  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
      {fields.map((f) => <input key={f.key} className="inp" type={f.type ?? "text"} placeholder={f.placeholder ?? f.label} aria-label={f.label} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} style={{ padding: 10, border: "1px solid #d8d8e4", borderRadius: 10 }} />)}
      <div><button className="btn" disabled={state.busy} onClick={go}>{state.busy ? "Saving…" : cta}</button>{state.msg && <span className="mute" style={{ marginLeft: 8, color: state.ok ? undefined : "#b3261e" }}>{state.msg}</span>}</div>
    </div>
  );
}
export const GrantCredits = () => <Form kind="grant" cta="Grant credits" fields={[{ key: "email", label: "Account email" }, { key: "credits", label: "Credits (1 to 5,000)", type: "number" }, { key: "reason", label: "Reason (saved in the ledger)" }]} />;
export const ExtendTrial = () => <Form kind="extend-trial" cta="Extend trial" fields={[{ key: "email", label: "Account email" }, { key: "days", label: "Days (1 to 14)", type: "number" }, { key: "reason", label: "Reason" }]} />;
