"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHECKS, FLAG_TEXT } from "@/lib/creator-checks";

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
      <select className="field" name="stage" defaultValue="prospect"><option value="prospect">Just found them (haven't messaged yet)</option><option value="invited">They said yes</option></select>
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

export function VideoReview({ id, url, views, status, note, checks, flags = [], kind = "trial" }: { id: string; url: string; views: number | null; status: string; note: string | null; checks: Record<string, boolean>; flags?: string[]; kind?: string }) {
  const router = useRouter();
  const [c, setC] = useState<Record<string, boolean>>(checks ?? {});
  const [v, setV] = useState(views == null ? "" : String(views)); const [n, setN] = useState(note ?? "");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(next: string, force = false) {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/creators/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status: next, views: v === "" ? undefined : Number(v), checks: c, note: n, force }) }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { message?: string; error?: string } | undefined;
    setBusy(false);
    if (res?.status === 409 && !force && window.confirm(`${d?.error ?? "This video has warnings."}\n\nVerify it anyway?`)) return save(next, true);
    setMsg({ ok: !!res?.ok, text: d?.message ?? d?.error ?? "Network error." }); if (res?.ok) router.refresh();
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
      {flags.length > 0 && <div className="note warn" style={{ margin: 0 }}>Check this one: {flags.map((f) => FLAG_TEXT[f] ?? f.replace(/_/g, " ")).join(" · ")}</div>}
      {kind === "partner" && <span className="mute" style={{ fontSize: 12.5 }}>Partner video (counts toward this month)</span>}
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

export function CopyText({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1600); } catch { window.prompt("Copy this", text); } }}>{ok ? "Copied ✓" : label}</button>;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
/** Partner terms, the numbers they earned, and recording a payout. Ryan only (the page does not render it for anyone else). */
export function PartnerPanel({ id, pct, months, vpm, link, code, st }: { id: string; pct: number; months: number; vpm: number; link: string; code: string; st: { signups: number; paying: number; owedCents: number; paidCents: number; mrrCents: number; byPeriod: { period: string; owedCents: number; paidCents: number }[]; referrals: { id: string; email: string; name: string; plan: string | null; paying: boolean; paidCents: number }[] } }) {
  const router = useRouter();
  const [terms, setTerms] = useState({ commissionPct: String(pct), commissionMonths: String(months), videosPerMonth: String(vpm) });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const due = st.byPeriod.filter((x) => x.owedCents > 0);
  const [period, setPeriod] = useState(due[0]?.period ?? ""); const [amount, setAmount] = useState(due[0] ? (due[0].owedCents / 100).toFixed(2) : ""); const [note, setNote] = useState("");
  async function run(body: unknown) { setBusy(true); setMsg(null); const r = await call("/api/creators", body); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }
  return (
    <div className="card" style={{ display: "grid", gap: 14 }}>
      <div className="grid g4">
        <div><div className="eyebrow">Signed up</div><div className="num" style={{ fontSize: 30 }}>{st.signups}</div></div>
        <div><div className="eyebrow">Paying now</div><div className="num" style={{ fontSize: 30 }}>{st.paying}</div></div>
        <div><div className="eyebrow">Commission / month</div><div className="num" style={{ fontSize: 30 }}>{money(st.mrrCents)}</div></div>
        <div><div className="eyebrow">Owed · paid</div><div className="num" style={{ fontSize: 30 }}>{money(st.owedCents)} <span className="mute" style={{ fontSize: 15 }}>· {money(st.paidCents)}</span></div></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><span className="mute">Code <b style={{ color: "var(--fg)" }}>{code}</b></span><CopyText text={link} label="Copy their sign-up link" /></div>
      {st.referrals.length > 0 && <div className="tw"><table><thead><tr><th>Person</th><th>Plan</th><th className="n">Paid so far</th></tr></thead><tbody>{st.referrals.map((r) => <tr key={r.id}><td>{r.name || r.email}<div className="mute" style={{ fontSize: 12.5 }}>{r.email}</div></td><td>{r.paying ? <span className="pill ok">Paying</span> : <span className="pill">{r.plan ?? "trial"}</span>}</td><td className="n">{money(r.paidCents)}</td></tr>)}</tbody></table></div>}
      <details><summary className="mute">Terms: {pct}% for {months} months, {vpm} video{vpm === 1 ? "" : "s"} a month</summary>
        <div className="grid g3" style={{ gap: 10, marginTop: 10 }}>
          <label className="mute">Commission %<input className="field" type="number" min={5} max={40} value={terms.commissionPct} onChange={(e) => setTerms({ ...terms, commissionPct: e.target.value })} /></label>
          <label className="mute">Months per referral<input className="field" type="number" min={1} max={36} value={terms.commissionMonths} onChange={(e) => setTerms({ ...terms, commissionMonths: e.target.value })} /></label>
          <label className="mute">Videos / month<input className="field" type="number" min={1} max={12} value={terms.videosPerMonth} onChange={(e) => setTerms({ ...terms, videosPerMonth: e.target.value })} /></label>
        </div>
        <div style={{ marginTop: 10 }}><button className="btn" disabled={busy} onClick={() => run({ action: "partner_terms", id, ...terms })}>Save terms</button></div>
      </details>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="eyebrow">Record a payout (after you've sent the money yourself)</div>
        <div className="grid g3" style={{ gap: 10 }}>
          <select className="field" value={period} onChange={(e) => { setPeriod(e.target.value); const x = st.byPeriod.find((p) => p.period === e.target.value); if (x) setAmount((x.owedCents / 100).toFixed(2)); }}><option value="">Month…</option>{st.byPeriod.map((p) => <option key={p.period} value={p.period}>{p.period} · owed {money(p.owedCents)}</option>)}</select>
          <input className="field" type="number" min={1} step="0.01" placeholder="Amount $" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="field" placeholder="How you paid (PayPal, Zelle…)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div><button className="btn primary" disabled={busy || !period || !amount} onClick={() => run({ action: "payout", id, period, amount: Number(amount), note })}>Record payout</button></div>
        <p className="mute" style={{ fontSize: 12.5 }}>Commission is estimated from the payments Mila recorded for people who signed up with their code. Confirm against Stripe before you pay.</p>
      </div>
      {msg && <div className={msg.ok ? "mute" : "err"}>{msg.text}</div>}
    </div>
  );
}

/** Turn a creator who did well into a partner. Ryan only. */
export function PromotePanel({ id, name, defaults }: { id: string; name: string; defaults: { pct: number; months: number; vpm: number } }) {
  const router = useRouter();
  const [t, setT] = useState({ commissionPct: String(defaults.pct), commissionMonths: String(defaults.months), videosPerMonth: String(defaults.vpm) });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    if (!window.confirm(`Make ${name} a partner? Free Mila while they post ${t.videosPerMonth} a month, and ${t.commissionPct}% of what their referrals pay for ${t.commissionMonths} months.`)) return;
    setBusy(true); const r = await call("/api/creators", { action: "promote", id, ...t }); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh();
  }
  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div><b>Make them a partner</b><p className="mute" style={{ fontSize: 13.5 }}>Mila stays free while they post their monthly videos, they get a sign-up link, and they earn a percentage of what their referrals pay.</p></div>
      <div className="grid g3" style={{ gap: 10 }}>
        <label className="mute">Commission %<input className="field" type="number" min={5} max={40} value={t.commissionPct} onChange={(e) => setT({ ...t, commissionPct: e.target.value })} /></label>
        <label className="mute">Months per referral<input className="field" type="number" min={1} max={36} value={t.commissionMonths} onChange={(e) => setT({ ...t, commissionMonths: e.target.value })} /></label>
        <label className="mute">Videos / month<input className="field" type="number" min={1} max={12} value={t.videosPerMonth} onChange={(e) => setT({ ...t, videosPerMonth: e.target.value })} /></label>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><button className="btn primary" disabled={busy} onClick={go}>{busy ? "Working…" : "Make partner"}</button>{msg && <span className={msg.ok ? "mute" : "err"}>{msg.text}</span>}</div>
    </div>
  );
}
