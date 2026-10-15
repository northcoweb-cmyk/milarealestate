"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveData, LiveEvent } from "@/lib/live";

const KIND: Record<LiveEvent["kind"], { icon: string; text: (e: LiveEvent) => string; color: string }> = {
  signup: { icon: "👋", text: (e) => `${e.who} created an account`, color: "#8fb4ff" },
  setup: { icon: "✅", text: (e) => `${e.who} finished setup`, color: "#7be0b0" },
  first_message: { icon: "💬", text: (e) => `${e.who} sent Mila their first message`, color: "#c7a8ff" },
  paid: { icon: "💳", text: (e) => `${e.who} subscribed${e.detail ? ` · ${e.detail}` : ""}`, color: "#ffc9a8" },
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
  const [burst, setBurst] = useState(0); const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null); const prevAccounts = useRef<number | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/live", { cache: "no-store" });
      if (r.status === 401) { window.location.href = "/login"; return; }
      const j = await r.json(); if (!r.ok) { setErr(j.error ?? "Couldn't load."); return; }
      setErr(""); setD(j as LiveData);
      const ids = new Set<string>((j as LiveData).events.map((e) => e.id));
      if (seen.current) { const n = new Set([...ids].filter((x) => !seen.current!.has(x))); if (n.size) { setFresh(n); setTimeout(() => setFresh(new Set()), 6000); } }
      seen.current = ids;
      if (prevAccounts.current !== null && (j as LiveData).accounts > prevAccounts.current) setBurst((b) => b + 1);
      prevAccounts.current = (j as LiveData).accounts;
    } catch { setErr("Reconnecting…"); }
  }, []);
  useEffect(() => { load(); const a = setInterval(load, 5000), b = setInterval(() => setTick(Date.now()), 1000); return () => { clearInterval(a); clearInterval(b); }; }, [load]);
  const toGo = d ? new Date(d.launchAt).getTime() - tick : 0;
  const fmtGo = () => { const s = Math.max(0, Math.floor(toGo / 1000)), dd = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return `${dd ? dd + "d " : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`; };
  const maxH = Math.max(1, ...(d?.perHour ?? []).map((x) => x.n));
  const tiles: [string, number | string, string, string?][] = d ? [
    ["Accounts created", d.accounts, "#8fb4ff", `${d.accountsToday} today`], ["Finished setup", d.setup, "#7be0b0", `${d.accounts ? Math.round((d.setup / d.accounts) * 100) : 0}% of accounts`],
    ["Using Mila", d.usingMila, "#c7a8ff", `${d.activeNow} active right now`], ["Paying", d.paid, "#ffc9a8", `${d.trials} on trial`],
    ["Seats left", d.seatsLeft, "#ffe08f", `of ${d.seatCap}`], ["On the waitlist", d.waitlist, "#b9b2ff", "waiting to get in"],
  ] : [];

  return (
    <div className="live">
      <style>{CSS}</style>
      <div className="stars" aria-hidden />
      {burst > 0 && <Confetti key={burst} />}
      <header className="lhead">
        <div className="lbrand">Mila<span>live</span></div>
        <div className="lstatus"><i className={err ? "dot bad" : "dot"} />{err || "Live"}<a href="/">← Mila OS</a></div>
      </header>
      {!d ? <p className="lmute" style={{ textAlign: "center", marginTop: 120 }}>{err || "Loading…"}</p> : <>
        {!d.launched ? (
          <section className="hero"><p className="lmute">Mila opens in</p><p className="bigtime">{fmtGo()}</p><p className="lmute">Tuesday · Oct 20 · 10:00 AM ET · {d.waitlist.toLocaleString()} people waiting</p></section>
        ) : (
          <section className="hero launched"><p className="lmute">Accounts created</p><p className="bignum"><Count to={d.accounts} /></p><p className="lmute">{d.seatsLeft > 0 ? `${d.seatsLeft} of ${d.seatCap} seats left` : "All seats taken"} · launched {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(d.launchAt))} ET</p></section>
        )}
        <section className="tiles">{tiles.map(([label, val, color, sub]) => (
          <div key={label} className="tile" style={{ ["--c" as string]: color }}><p className="tl">{label}</p><p className="tn">{typeof val === "number" ? <Count to={val} /> : val}</p>{sub && <p className="ts">{sub}</p>}</div>
        ))}</section>
        <section className="cols">
          <div className="panel feed"><h2>What's happening</h2>
            {d.events.length === 0 && <p className="lmute">Waiting for the first account…</p>}
            <ul>{d.events.map((e) => { const k = KIND[e.kind]; return (
              <li key={e.id} className={fresh.has(e.id) ? "ev new" : "ev"} style={{ ["--c" as string]: k.color }}><span className="ic">{k.icon}</span><span className="tx">{k.text(e)}</span><span className="tm">{when(e.at, tick)}</span></li>
            ); })}</ul>
          </div>
          <div className="panel"><h2>Sign-ups per hour</h2>
            <div className="bars">{d.perHour.map((h, i) => <div key={i} className="bw"><div className="bar" style={{ height: `${Math.max(4, (h.n / maxH) * 100)}%` }}><b>{h.n || ""}</b></div><span>{h.hour}</span></div>)}</div>
            <div className="mini"><div><p className="tl">AI cost today</p><p className="tn sm"><Count to={d.aiTodayUsd} prefix="$" decimals={2} /></p></div><div><p className="tl">Credits used today</p><p className="tn sm"><Count to={d.creditsToday} /></p></div></div>
          </div>
        </section>
      </>}
    </div>
  );
}

function Confetti() {
  const bits = Array.from({ length: 70 }, (_, i) => ({ i, x: Math.random() * 100, d: Math.random() * 0.5, s: 6 + Math.random() * 8, c: ["#8fb4ff", "#c7a8ff", "#ffc9a8", "#7be0b0", "#ffe08f"][i % 5], r: Math.random() * 360 }));
  return <div className="confetti" aria-hidden>{bits.map((b) => <i key={b.i} style={{ left: `${b.x}%`, width: b.s, height: b.s * 1.6, background: b.c, animationDelay: `${b.d}s`, transform: `rotate(${b.r}deg)` }} />)}</div>;
}

const CSS = `
.live{position:fixed;inset:0;overflow:auto;background:radial-gradient(120% 90% at 50% 0%,#3c2fa8 0%,#1c1658 45%,#0c0a2e 100%);color:#fff;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:clamp(14px,2.2vw,34px)}
.stars{position:fixed;inset:0;pointer-events:none;background-image:radial-gradient(1.5px 1.5px at 12% 18%,#fff,transparent),radial-gradient(1px 1px at 38% 62%,#fff,transparent),radial-gradient(1.5px 1.5px at 66% 24%,#fff,transparent),radial-gradient(1px 1px at 84% 72%,#fff,transparent),radial-gradient(1px 1px at 24% 84%,#fff,transparent),radial-gradient(1.5px 1.5px at 92% 12%,#fff,transparent);opacity:.55;animation:tw 6s ease-in-out infinite alternate}
@keyframes tw{from{opacity:.25}to{opacity:.7}}
.lhead{position:relative;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:clamp(8px,1.6vw,22px)}
.lbrand{font-family:Georgia,'Times New Roman',serif;font-size:clamp(26px,3vw,44px)}.lbrand span{font:700 clamp(10px,1vw,13px) -apple-system,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#b9b2ff;margin-left:12px}
.lstatus{display:flex;align-items:center;gap:10px;font-size:clamp(12px,1.1vw,16px);color:#d9d4ff}.lstatus a{color:#b9b2ff;margin-left:14px;text-decoration:none;opacity:.7}
.dot{width:10px;height:10px;border-radius:50%;background:#58e0a0;box-shadow:0 0 0 0 rgba(88,224,160,.6);animation:pulse 1.8s infinite}.dot.bad{background:#ff7a7a;animation:none}
@keyframes pulse{70%{box-shadow:0 0 0 12px rgba(88,224,160,0)}100%{box-shadow:0 0 0 0 rgba(88,224,160,0)}}
.live p,.live h2,.live ul{margin:0}
.hero{position:relative;text-align:center;padding:clamp(6px,1.4vh,34px) 10px clamp(10px,2vh,30px)}.lmute{color:#c9c4ee;font-size:clamp(13px,1.5vw,22px);letter-spacing:.04em}
.bigtime{font-family:Georgia,'Times New Roman',serif;font-size:clamp(56px,min(13vw,19vh),200px);line-height:1;margin:.1em 0;text-shadow:0 0 50px rgba(166,140,255,.9),0 0 120px rgba(143,180,255,.5);font-variant-numeric:tabular-nums}
.bignum{font-family:Georgia,'Times New Roman',serif;font-size:clamp(80px,min(17vw,21vh),260px);line-height:1;margin:.04em 0;background:linear-gradient(180deg,#fff,#c7b8ff 70%,#ffc9a8);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 40px rgba(166,140,255,.7));font-variant-numeric:tabular-nums}
.tiles{position:relative;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(8px,1.2vw,18px);margin-bottom:clamp(10px,1.6vw,24px)}
.tile{border-radius:24px;padding:clamp(12px,1.6vw,26px);background:linear-gradient(160deg,rgba(255,255,255,.12),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(8px);box-shadow:0 0 40px -18px var(--c)}
.tl{font:700 clamp(9px,.9vw,13px) -apple-system,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#b9b2ff}.tn{font-family:Georgia,'Times New Roman',serif;font-size:clamp(34px,min(4.6vw,7vh),76px);line-height:1.05;color:var(--c,#fff);margin-top:.1em;font-variant-numeric:tabular-nums}.tn.sm{font-size:clamp(26px,2.8vw,44px);color:#fff}.ts{color:#c9c4ee;font-size:clamp(11px,1vw,15px);margin-top:2px}
.cols{position:relative;display:grid;grid-template-columns:1.4fr 1fr;gap:clamp(10px,1.4vw,22px)}
.panel{border-radius:26px;padding:clamp(14px,1.8vw,28px);background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12)}.panel h2{font:700 clamp(11px,1vw,14px) -apple-system,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#b9b2ff;margin-bottom:12px}
.feed ul{list-style:none;margin:0;padding:0;display:grid;gap:8px;max-height:min(40vh,620px);overflow:hidden}
.ev{display:flex;align-items:center;gap:12px;padding:clamp(8px,1vw,14px) clamp(10px,1.2vw,18px);border-radius:16px;background:rgba(255,255,255,.06);border-left:4px solid var(--c);font-size:clamp(13px,1.45vw,22px)}
.ev .ic{font-size:1.3em}.ev .tx{flex:1;min-width:0}.ev .tm{color:#b9b2ff;font-size:.8em;white-space:nowrap}
.ev.new{animation:slide .7s cubic-bezier(.2,.9,.2,1),glow 3s ease-out;background:rgba(255,255,255,.16)}
@keyframes slide{from{transform:translateY(-24px) scale(.97);opacity:0}to{transform:none;opacity:1}}@keyframes glow{from{box-shadow:0 0 36px -2px var(--c)}to{box-shadow:none}}
.bars{display:flex;align-items:flex-end;gap:clamp(4px,.6vw,10px);height:clamp(110px,20vh,260px)}.bw{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px;height:100%;font-size:clamp(9px,.9vw,13px);color:#b9b2ff}
.bar{width:100%;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#c7a8ff,#8fb4ff);position:relative;transition:height .8s}.bar b{position:absolute;top:-1.4em;left:0;right:0;text-align:center;color:#fff;font-weight:700}
.mini{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:clamp(12px,2vw,26px)}
.confetti{position:fixed;inset:0;pointer-events:none;z-index:50;overflow:hidden}.confetti i{position:absolute;top:-20px;border-radius:2px;animation:fall 3.2s cubic-bezier(.3,.6,.4,1) forwards}@keyframes fall{to{transform:translateY(110vh) rotate(720deg);opacity:.8}}
@media (max-width:900px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.cols{grid-template-columns:1fr}.feed ul{max-height:none}}
@media (min-width:901px) and (max-width:1300px){.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
