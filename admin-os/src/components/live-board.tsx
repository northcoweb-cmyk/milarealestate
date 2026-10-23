"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveData, LiveEvent } from "@/lib/live";

const KIND: Record<LiveEvent["kind"], { icon: string; text: (e: LiveEvent) => string; color: string }> = {
  signup: { icon: "", text: (e) => `${e.who} created an account`, color: "#6ea8ff" },
  setup: { icon: "", text: (e) => `${e.who} finished setup`, color: "#4fd1a1" },
  first_message: { icon: "", text: (e) => `${e.who} sent Mila their first message`, color: "#a78bfa" },
  queued: { icon: "", text: (e) => `${e.who} joined the queue`, color: "#8b93b8" },
  granted: { icon: "", text: (e) => `${e.who} was granted access${e.detail ? ` · ${e.detail}` : ""}`, color: "#4fd1a1" },
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
  const launchedNow = !!d && (d.launched || toGo <= 0);
  const [burst, setBurst] = useState(0); const wasLive = useRef<boolean | null>(null);
  useEffect(() => { if (!d) return; if (wasLive.current === false && launchedNow) setBurst((b) => b + 1); wasLive.current = launchedNow; }, [launchedNow, d]);
  const secs = Math.ceil(toGo / 1000);
  const maxH = Math.max(1, ...(d?.perHour ?? []).map((x) => x.n));
  const tiles: [string, number | string, string, string?][] = d ? [
    ["Accounts created", d.accounts, "#6ea8ff", `${d.accountsToday} today`], ["Finished setup", d.setup, "#4fd1a1", `${d.accounts ? Math.round((d.setup / d.accounts) * 100) : 0}% of accounts`],
    ["Using Mila", d.usingMila, "#a78bfa", `${d.activeNow} active right now`], ["Paying", d.paid, "#f5a97f", `${d.trials} on trial`],
    ["Seats left", d.seatsLeft, "#f2c94c", `of ${d.seatCap}`], ["In the queue", d.queued, "#8b93b8", `${d.invitedWaiting} invited, not in yet · ${d.claimed} joined`],
  ] : [];

  const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d ? new Date(d.launchAt) : new Date());
  return (
    <div className="live">
      <style>{CSS}</style>
      {burst > 0 && <Confetti key={burst} />}
      <div className="wrap"><header className="lhead">
        <div className="lbrand">Mila<span>Live</span></div>
        <div className="lstatus"><i className={err ? "dot bad" : "dot"} />{err || "Live"}<a href="/">Mila OS</a></div>
      </header>
      {!d ? <p className="lmute" style={{ textAlign: "center", marginTop: 120 }}>{err || "Loading…"}</p> : <>
        {!launchedNow ? (
          <section className="hero"><p className="lmute">Mila opens in</p>{secs > 0 && secs <= 10 ? <p key={secs} className="final">{secs}</p> : <p className="bigtime">{fmtGo()}</p>}<p className="lmute">Friday, Oct 23 · {clock} ET · {d.waitlist.toLocaleString()} on the waitlist</p></section>
        ) : (
          <section className="hero"><p className="lmute">Accounts created</p><p className="bignum"><Count to={d.accounts} /></p><p className="lmute">{d.seatsLeft > 0 ? `${d.seatsLeft} of ${d.seatCap} seats left` : "All seats taken"} · opened {clock} ET</p></section>
        )}
        <section className="tiles">{tiles.map(([label, val, color, sub]) => (
          <div key={label} className="tile" style={{ ["--c" as string]: color }}><p className="tl">{label}</p><p className="tn">{typeof val === "number" ? <Count to={val} /> : val}</p>{sub && <p className="ts">{sub}</p>}</div>
        ))}</section>
        <section className="cols">
          <div className="panel feed"><h2>Activity</h2>
            {d.events.length === 0 && <p className="lmute sm">Waiting for the first account…</p>}
            <ul>{d.events.slice(0, 10).map((e) => { const k = KIND[e.kind]; return (
              <li key={e.id} className={fresh.has(e.id) ? "ev new" : "ev"} style={{ ["--c" as string]: k.color }}><i className="pip" /><span className="tx">{k.text(e)}</span><span className="tm">{when(e.at, tick)}</span></li>
            ); })}</ul>
          </div>
          <div className="panel"><h2>Sign-ups per hour</h2>
            <div className="bars">{d.perHour.map((h, i) => <div key={i} className="bw"><div className="bar" style={{ height: `${Math.max(3, (h.n / maxH) * 100)}%` }}><b>{h.n || ""}</b></div><span>{h.hour}</span></div>)}</div>
            <div className="mini"><div><p className="tl">AI cost today</p><p className="tn sm"><Count to={d.aiTodayUsd} prefix="$" decimals={2} /></p></div><div><p className="tl">Credits used today</p><p className="tn sm"><Count to={d.creditsToday} /></p></div></div>
          </div>
        </section>
      </>}
    </div></div>
  );
}

function Confetti() {
  const bits = Array.from({ length: 160 }, (_, i) => ({ i, x: Math.random() * 100, d: Math.random() * 1.2, s: 7 + Math.random() * 9, c: ["#6ea8ff", "#a78bfa", "#f5a97f", "#4fd1a1", "#f2c94c", "#ffffff"][i % 6], r: Math.random() * 360 }));
  return <div className="confetti" aria-hidden>{bits.map((b) => <i key={b.i} style={{ left: `${b.x}%`, width: b.s, height: b.s * 1.5, background: b.c, animationDelay: `${b.d}s`, transform: `rotate(${b.r}deg)` }} />)}</div>;
}

const CSS = `
.final{font-size:clamp(90px,min(16vw,26vh),240px);font-weight:700;line-height:1;margin:.05em 0;color:#fff;animation:pop 1s ease-out}@keyframes pop{from{transform:scale(1.25);opacity:.2}to{transform:scale(1);opacity:1}}
.confetti{position:fixed;inset:0;pointer-events:none;z-index:50;overflow:hidden}.confetti i{position:absolute;top:-20px;border-radius:2px;animation:fall 3.8s cubic-bezier(.3,.6,.4,1) forwards}@keyframes fall{to{transform:translateY(110vh) rotate(720deg);opacity:.8}}
.live{position:fixed;inset:0;overflow:auto;background:#0b0e1a;color:#f2f4fb;font-family:-apple-system,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:clamp(16px,2vw,32px);-webkit-font-smoothing:antialiased}
.wrap{max-width:1280px;margin:0 auto}
.live p,.live h2,.live ul{margin:0}
.lhead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:clamp(10px,2vh,28px)}
.lbrand{font-size:clamp(20px,1.6vw,26px);font-weight:700;letter-spacing:-.02em}.lbrand span{font-size:clamp(10px,.85vw,12px);font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#8b93b8;margin-left:12px}
.lstatus{display:flex;align-items:center;gap:8px;font-size:clamp(12px,1vw,15px);color:#aab1d1}.lstatus a{color:#6b7398;margin-left:16px;text-decoration:none}
.dot{width:8px;height:8px;border-radius:50%;background:#4fd1a1}.dot.bad{background:#ff7a7a}
.hero{text-align:center;padding:clamp(8px,2.5vh,32px) 10px clamp(16px,3vh,36px)}.lmute{color:#8b93b8;font-size:clamp(13px,1vw,16px)}.lmute.sm{font-size:14px}
.bigtime,.bignum{font-size:clamp(48px,min(7vw,12vh),104px);font-weight:700;letter-spacing:-.04em;line-height:1;margin:.12em 0;font-variant-numeric:tabular-nums;color:#fff}
.tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(10px,1.1vw,16px);margin-bottom:clamp(12px,1.6vw,22px)}
.tile{border-radius:16px;padding:clamp(14px,1.2vw,20px);background:#131830;border:1px solid #1e2547}
.tl{font-size:clamp(10px,.85vw,12px);font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#8b93b8}
.tn{font-size:clamp(26px,min(2.6vw,4.4vh),40px);font-weight:700;letter-spacing:-.03em;line-height:1.1;color:var(--c,#fff);margin-top:.18em;font-variant-numeric:tabular-nums}.tn.sm{font-size:clamp(20px,1.7vw,28px);color:#fff}
.ts{color:#6b7398;font-size:clamp(11px,.9vw,14px);margin-top:4px}
.cols{display:grid;grid-template-columns:1.3fr 1fr;gap:clamp(10px,1.1vw,16px)}
.panel{border-radius:16px;padding:clamp(16px,1.6vw,26px);background:#131830;border:1px solid #1e2547}.panel h2{font-size:clamp(10px,.85vw,12px);font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#8b93b8;margin-bottom:14px}
.feed ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.ev{display:flex;align-items:center;gap:14px;padding:clamp(9px,1vw,14px) 4px;border-bottom:1px solid #1e2547;font-size:clamp(13px,1vw,15px)}.ev:last-child{border-bottom:0}
.pip{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}.ev .tx{flex:1;min-width:0;color:#e4e8f6}.ev .tm{color:#6b7398;font-size:.82em;white-space:nowrap}
.ev.new{animation:fade .8s ease-out}@keyframes fade{from{background:#1c2450;opacity:.4}to{background:transparent;opacity:1}}
.bars{display:flex;align-items:flex-end;gap:clamp(4px,.6vw,10px);height:clamp(100px,18vh,170px)}.bw{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:8px;height:100%;font-size:clamp(9px,.8vw,12px);color:#6b7398}
.bar{width:100%;border-radius:6px 6px 2px 2px;background:#6ea8ff;position:relative;transition:height .6s}.bar b{position:absolute;top:-1.5em;left:0;right:0;text-align:center;color:#e4e8f6;font-weight:600}
.mini{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:clamp(14px,2vw,28px);padding-top:clamp(12px,1.4vw,20px);border-top:1px solid #1e2547}
@media (max-width:900px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.cols{grid-template-columns:1fr}}
@media (min-width:901px) and (max-width:1300px){.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
