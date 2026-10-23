"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveData, LiveEvent } from "@/lib/live";

const KIND: Record<LiveEvent["kind"], { icon: string; text: (e: LiveEvent) => string; color: string }> = {
  signup: { icon: "", text: (e) => `${e.who} created an account`, color: "#6ea8ff" },
  setup: { icon: "", text: (e) => `${e.who} finished setup`, color: "#4fd1a1" },
  first_message: { icon: "", text: (e) => `${e.who} sent Mila their first message`, color: "#a78bfa" },
  paid: { icon: "", text: (e) => `${e.who} subscribed${e.detail ? ` · ${e.detail}` : ""}`, color: "#f5a97f" },
};

/** Animated number: eases from the old value to the new one. */
function Count({ to, prefix = "", decimals = 0 }: { to: number; prefix?: string; decimals?: number }) {
  const [v, setV] = useState(to); const from = useRef(to);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = to; let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - start) / 900), e = 1 - Math.pow(1 - k, 3); setV(a + (b - a) * e); if (k < 1) raf = requestAnimationFrame(tick); else from.current = b; };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{prefix}{v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
}

const when = (iso: string, now: number) => { const s = Math.max(0, (now - new Date(iso).getTime()) / 1000); return s < 45 ? "just now" : s < 3600 ? `${Math.round(s / 60)}m ago` : new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(iso)); };

export function LiveBoard() {
  const [d, setD] = useState<LiveData | null>(null); const [err, setErr] = useState("");
  const [tick, setTick] = useState(() => Date.now());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/live", { cache: "no-store" });
      if (r.status === 401) { window.location.href = "/login"; return; }
      const j = await r.json(); if (!r.ok) { setErr(j.error ?? "Couldn't load."); return; }
      setErr(""); setD(j as LiveData);
      const ids = new Set<string>((j as LiveData).events.map((e) => e.id));
      if (seen.current) { const n = new Set([...ids].filter((x) => !seen.current!.has(x))); if (n.size) { setFresh(n); setTimeout(() => setFresh(new Set()), 6000); } }
      seen.current = ids;
    } catch { setErr("Reconnecting…"); }
  }, []);
  useEffect(() => { load(); const a = setInterval(load, 5000), b = setInterval(() => setTick(Date.now()), 1000); return () => { clearInterval(a); clearInterval(b); }; }, [load]);
  const toGo = d ? new Date(d.launchAt).getTime() - tick : 0;
  const fmtGo = () => { const s = Math.max(0, Math.floor(toGo / 1000)), dd = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return `${dd ? dd + "d " : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`; };
  const maxH = Math.max(1, ...(d?.perHour ?? []).map((x) => x.n));
  const tiles: [string, number | string, string, string?][] = d ? [
    ["Accounts created", d.accounts, "#6ea8ff", `${d.accountsToday} today`], ["Finished setup", d.setup, "#4fd1a1", `${d.accounts ? Math.round((d.setup / d.accounts) * 100) : 0}% of accounts`],
    ["Using Mila", d.usingMila, "#a78bfa", `${d.activeNow} active right now`], ["Paying", d.paid, "#f5a97f", `${d.trials} on trial`],
    ["Seats left", d.seatsLeft, "#f2c94c", `of ${d.seatCap}`], ["On the waitlist", d.waitlist, "#8b93b8", "waiting to get in"],
  ] : [];

  const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d ? new Date(d.launchAt) : new Date());
  return (
    <div className="live">
      <style>{CSS}</style>
      <header className="lhead">
        <div className="lbrand">Mila<span>Live</span></div>
        <div className="lstatus"><i className={err ? "dot bad" : "dot"} />{err || "Live"}<a href="/">Mila OS</a></div>
      </header>
      {!d ? <p className="lmute" style={{ textAlign: "center", marginTop: 120 }}>{err || "Loading…"}</p> : <>
        {!d.launched ? (
          <section className="hero"><p className="lmute">Mila opens in</p><p className="bigtime">{fmtGo()}</p><p className="lmute">Friday, Oct 23 · {clock} ET · {d.waitlist.toLocaleString()} on the waitlist</p></section>
        ) : (
          <section className="hero"><p className="lmute">Accounts created</p><p className="bignum"><Count to={d.accounts} /></p><p className="lmute">{d.seatsLeft > 0 ? `${d.seatsLeft} of ${d.seatCap} seats left` : "All seats taken"} · opened {clock} ET</p></section>
        )}
        <section className="tiles">{tiles.map(([label, val, color, sub]) => (
          <div key={label} className="tile" style={{ ["--c" as string]: color }}><p className="tl">{label}</p><p className="tn">{typeof val === "number" ? <Count to={val} /> : val}</p>{sub && <p className="ts">{sub}</p>}</div>
        ))}</section>
        <section className="cols">
          <div className="panel feed"><h2>Activity</h2>
            {d.events.length === 0 && <p className="lmute sm">Waiting for the first account…</p>}
            <ul>{d.events.slice(0, 8).map((e) => { const k = KIND[e.kind]; return (
              <li key={e.id} className={fresh.has(e.id) ? "ev new" : "ev"} style={{ ["--c" as string]: k.color }}><i className="pip" /><span className="tx">{k.text(e)}</span><span className="tm">{when(e.at, tick)}</span></li>
            ); })}</ul>
          </div>
          <div className="panel"><h2>Sign-ups per hour</h2>
            <div className="bars">{d.perHour.map((h, i) => <div key={i} className="bw"><div className="bar" style={{ height: `${Math.max(3, (h.n / maxH) * 100)}%` }}><b>{h.n || ""}</b></div><span>{h.hour}</span></div>)}</div>
            <div className="mini"><div><p className="tl">AI cost today</p><p className="tn sm"><Count to={d.aiTodayUsd} prefix="$" decimals={2} /></p></div><div><p className="tl">Credits used today</p><p className="tn sm"><Count to={d.creditsToday} /></p></div></div>
          </div>
        </section>
      </>}
    </div>
  );
}

const CSS = `
.live{position:fixed;inset:0;overflow:auto;background:#0b0e1a;color:#f2f4fb;font-family:-apple-system,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:clamp(18px,2.6vw,44px);-webkit-font-smoothing:antialiased}
.live p,.live h2,.live ul{margin:0}
.lhead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:clamp(10px,2vh,28px)}
.lbrand{font-size:clamp(22px,2.2vw,32px);font-weight:700;letter-spacing:-.02em}.lbrand span{font-size:clamp(10px,.85vw,12px);font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#8b93b8;margin-left:12px}
.lstatus{display:flex;align-items:center;gap:8px;font-size:clamp(12px,1vw,15px);color:#aab1d1}.lstatus a{color:#6b7398;margin-left:16px;text-decoration:none}
.dot{width:8px;height:8px;border-radius:50%;background:#4fd1a1}.dot.bad{background:#ff7a7a}
.hero{text-align:center;padding:clamp(8px,3vh,48px) 10px clamp(18px,4vh,56px)}.lmute{color:#8b93b8;font-size:clamp(13px,1.3vw,20px)}.lmute.sm{font-size:14px}
.bigtime,.bignum{font-size:clamp(64px,min(12vw,20vh),190px);font-weight:700;letter-spacing:-.04em;line-height:1;margin:.12em 0;font-variant-numeric:tabular-nums;color:#fff}
.tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(10px,1.1vw,16px);margin-bottom:clamp(12px,1.6vw,22px)}
.tile{border-radius:16px;padding:clamp(14px,1.5vw,24px);background:#131830;border:1px solid #1e2547}
.tl{font-size:clamp(10px,.85vw,12px);font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#8b93b8}
.tn{font-size:clamp(32px,min(3.8vw,6.5vh),64px);font-weight:700;letter-spacing:-.03em;line-height:1.1;color:var(--c,#fff);margin-top:.18em;font-variant-numeric:tabular-nums}.tn.sm{font-size:clamp(24px,2.4vw,38px);color:#fff}
.ts{color:#6b7398;font-size:clamp(11px,.9vw,14px);margin-top:4px}
.cols{display:grid;grid-template-columns:1.3fr 1fr;gap:clamp(10px,1.1vw,16px)}
.panel{border-radius:16px;padding:clamp(16px,1.6vw,26px);background:#131830;border:1px solid #1e2547}.panel h2{font-size:clamp(10px,.85vw,12px);font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#8b93b8;margin-bottom:14px}
.feed ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.ev{display:flex;align-items:center;gap:14px;padding:clamp(9px,1vw,14px) 4px;border-bottom:1px solid #1e2547;font-size:clamp(13px,1.2vw,18px)}.ev:last-child{border-bottom:0}
.pip{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}.ev .tx{flex:1;min-width:0;color:#e4e8f6}.ev .tm{color:#6b7398;font-size:.82em;white-space:nowrap}
.ev.new{animation:fade .8s ease-out}@keyframes fade{from{background:#1c2450;opacity:.4}to{background:transparent;opacity:1}}
.bars{display:flex;align-items:flex-end;gap:clamp(4px,.6vw,10px);height:clamp(110px,20vh,240px)}.bw{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:8px;height:100%;font-size:clamp(9px,.8vw,12px);color:#6b7398}
.bar{width:100%;border-radius:6px 6px 2px 2px;background:#6ea8ff;position:relative;transition:height .6s}.bar b{position:absolute;top:-1.5em;left:0;right:0;text-align:center;color:#e4e8f6;font-weight:600}
.mini{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:clamp(14px,2vw,28px);padding-top:clamp(12px,1.4vw,20px);border-top:1px solid #1e2547}
@media (max-width:900px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.cols{grid-template-columns:1fr}}
@media (min-width:901px) and (max-width:1300px){.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
