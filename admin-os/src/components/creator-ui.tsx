"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHECKS } from "@/lib/creator-checks";

async function call(url: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
    return { ok: r.ok, message: d.message ?? d.error ?? (r.ok ? "Done." : "Something went wrong.") };
  } catch { return { ok: false, message: "Network error. Try again." }; }
}

export function AddCreator() {
  const router = useRouter();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    const r = await call("/api/creators", { action: "add", ...f });
    setBusy(false); setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { (e.target as HTMLFormElement).reset(); router.refresh(); }
  }
  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>+ Add a creator</button>;
  return (
    <form onSubmit={submit} className="card" style={{ display: "grid", gap: 10, maxWidth: 560 }}>
      <div className="eyebrow">New creator</div>
      <div className="grid g2" style={{ gap: 10 }}><input className="field" name="name" placeholder="Name" required /><input className="field" name="email" type="email" placeholder="Email (their Mila login)" required /></div>
      <div className="grid g2" style={{ gap: 10 }}><input className="field" name="handle" placeholder="@handle" /><select className="field" name="platform" defaultValue="tiktok"><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="youtube">YouTube</option><option value="other">Other</option></select></div>
      <div className="grid g2" style={{ gap: 10 }}><input className="field" name="followers" type="number" min={0} placeholder="Followers (optional)" /><input className="field" name="notes" placeholder="Note (where you found them)" /></div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Add creator"}</button><button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>{msg && <span className={msg.ok ? "mute" : "err"}>{msg.text}</span>}</div>
    </form>
  );
}

/** One button that confirms, runs an action, and says exactly what happened. */
export function ActionButton({ id, action, label, confirmText, primary, extra, onDone }: { id: string; action: string; label: string; confirmText?: string; primary?: boolean; extra?: Record<string, unknown>; onDone?: (m: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true); setMsg(null);
    const r = await call("/api/creators", { action, id, ...extra });
    setBusy(false); setMsg({ ok: r.ok, text: r.message }); onDone?.(r.message);
    if (r.ok) router.refresh();
  }
  return <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><button className={`btn${primary ? " primary" : ""}`} disabled={busy} onClick={go}>{busy ? "Working…" : label}</button>{msg && <span className={msg.ok ? "mute" : "err"} style={{ fontSize: 13 }}>{msg.text}</span>}</span>;
}

export function CopyLink({ url }: { url: string }) {
  const [ok, setOk] = useState(false);
  return <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1800); } catch { window.prompt("Copy this link", url); } }}>{ok ? "Copied ✓" : "Copy their page link"}</button>;
}

export function VideoReview({ id, url, views, status, note, checks }: { id: string; url: string; views: number | null; status: string; note: string | null; checks: Record<string, boolean> }) {
  const router = useRouter();
  const [c, setC] = useState<Record<string, boolean>>(checks ?? {});
  const [v, setV] = useState(views == null ? "" : String(views)); const [n, setN] = useState(note ?? "");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(next: string) {
    setBusy(true); setMsg(null);
    const r = await call("/api/creators/video", { id, status: next, views: v === "" ? undefined : Number(v), checks: c, note: n });
    setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh();
  }
  const [open, setOpen] = useState(status !== "verified");
  const tone = status === "verified" ? "ok" : status === "changes" ? "warn" : status === "rejected" ? "bad" : "mute";
  if (!open) return <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}><a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--sky)", wordBreak: "break-all" }}>{url}</a><span style={{ display: "flex", gap: 10, alignItems: "center" }}>{views != null && <span className="mute">{views.toLocaleString()} views</span>}<span className="pill ok">Verified ✓</span><button className="btn" onClick={() => setOpen(true)}>Re-check</button></span></div>;
  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--sky)", wordBreak: "break-all" }}>{url}</a>
        <span className={`pill ${tone}`}>{status === "submitted" ? "Needs your check" : status === "changes" ? "Changes asked" : status === "verified" ? "Verified" : "Rejected"}</span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>{CHECKS.map(([k, label]) => <label key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={!!c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} style={{ width: 20, height: 20, accentColor: "#a68cff" }} />{label}</label>)}</div>
      <div className="grid g2" style={{ gap: 10 }}><input className="field" type="number" min={0} placeholder="Views right now" value={v} onChange={(e) => setV(e.target.value)} /><input className="field" placeholder="If it needs a change, say what (they get this by email)" value={n} onChange={(e) => setN(e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn primary" disabled={busy} onClick={() => save("verified")}>Verify</button>
        <button className="btn" disabled={busy} onClick={() => save("changes")}>Ask for a change</button>
        <button className="btn" disabled={busy} onClick={() => confirm("Reject this video?") && save("rejected")}>Reject</button>
        {msg && <span className={msg.ok ? "mute" : "err"} style={{ fontSize: 13 }}>{msg.text}</span>}
      </div>
    </div>
  );
}
