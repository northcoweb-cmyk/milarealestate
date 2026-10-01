"use client";

import { useEffect, useMemo, useState } from "react";
import { skyAt, type SkyState } from "@/lib/sky";

interface Props { initialNow: string; tz: string; lat?: number | null; lng?: number | null; theme?: "auto" | "day" | "night"; reduceMotion?: boolean }

const CLOUDS = [
  { w: 46, h: 14, top: "12%", left: "6%", anim: "drift-a 140s linear infinite alternate", o: 0.8 },
  { w: 60, h: 18, top: "26%", left: "52%", anim: "drift-b 170s linear infinite alternate", o: 0.65 },
  { w: 38, h: 11, top: "40%", left: "-4%", anim: "drift-b 190s linear infinite alternate", o: 0.5 },
  { w: 52, h: 15, top: "8%", left: "62%", anim: "drift-a 210s linear infinite alternate", o: 0.55 },
];
const STARS = Array.from({ length: 46 }, (_, i) => ({ x: (i * 53.7) % 100, y: (i * 31.3) % 70, s: 1 + ((i * 7) % 3) * 0.6, d: (i % 7) * 0.9 + 2.5 }));

export function Sky({ initialNow, tz, lat, lng, theme = "auto", reduceMotion = false }: Props) {
  const [now, setNow] = useState(() => new Date(initialNow));
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    const vis = () => { if (!document.hidden) setNow(new Date()); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, []);

  const base = useMemo<SkyState>(() => skyAt(now, tz, lat, lng), [now, tz, lat, lng]);
  // Appearance override: force a calm midday or deep-night sky.
  const sky = useMemo<SkyState>(() => {
    if (theme === "day") return skyAt(new Date(new Date(now).setUTCHours(17, 0, 0, 0)), tz, lat, lng);
    if (theme === "night") return skyAt(new Date(new Date(now).setUTCHours(4, 0, 0, 0)), tz, lat, lng);
    return base;
  }, [theme, base, now, tz, lat, lng]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sky-top", sky.top);
    root.style.setProperty("--sky-mid", sky.mid);
    root.style.setProperty("--sky-bottom", sky.bottom);
    root.dataset.tone = sky.tone;
    root.dataset.reduceMotion = reduceMotion ? "1" : "0";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", sky.mid);
  }, [sky, reduceMotion]);

  const warmGlow = sky.warmth;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.mid} 52%, ${sky.bottom} 100%)` }}>
      {/* horizon glow */}
      <div className="absolute inset-x-0 bottom-0 h-[55%]" style={{ opacity: 0.35 + warmGlow * 0.5, background: `radial-gradient(120% 80% at ${sky.sun.x}% 100%, ${sky.sun.color}${warmGlow > 0.2 ? "cc" : "66"}, transparent 70%)`, transition: "opacity 2s" }} />
      {/* sun */}
      <div className="absolute" style={{ left: `${sky.sun.x}%`, top: `${sky.sun.y}%`, width: 380, height: 380, marginLeft: -190, marginTop: -190, opacity: sky.sun.opacity, background: `radial-gradient(closest-side, ${sky.sun.color} 0%, ${sky.sun.color}88 14%, ${sky.sun.color}22 46%, transparent 72%)`, transition: "all 60s linear" }} />
      {/* moon */}
      <div className="absolute rounded-full" style={{ left: `${sky.moon.x}%`, top: `${sky.moon.y}%`, width: 54, height: 54, opacity: sky.moon.opacity, background: "radial-gradient(circle at 35% 35%, #fffdf2, #dfe4ff 60%, #b9c3f0)", boxShadow: "0 0 60px 10px rgba(200,210,255,.35)", transition: "opacity 4s" }} />
      {/* stars */}
      <div className="absolute inset-0" style={{ opacity: sky.stars, transition: "opacity 4s" }}>
        {STARS.map((s, i) => (
          <span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animation: reduceMotion ? undefined : `twinkle ${s.d}s ease-in-out ${s.d / 3}s infinite` }} />
        ))}
      </div>
      {/* clouds (none at night) */}
      <div className="absolute inset-0" style={{ opacity: sky.clouds * (sky.tone === "night" ? 0.25 : 1), transition: "opacity 4s" }}>
        {CLOUDS.map((c, i) => (
          <div key={i} className="sky-cloud" style={{ width: `${c.w}vw`, height: `${c.h}vh`, top: c.top, left: c.left, opacity: c.o * (0.7 + sky.daylight * 0.3), animation: reduceMotion ? undefined : c.anim, filter: warmGlow > 0.35 ? `sepia(${warmGlow * 0.6}) saturate(${1 + warmGlow}) hue-rotate(-10deg)` : undefined }} />
        ))}
      </div>
      {/* birds: a few, only in the morning */}
      {sky.birds && !reduceMotion && (
        <div className="absolute inset-x-0 top-[14%] h-24" style={{ opacity: 0.4 }}>
          {[0, 1, 2].map((i) => (
            <svg key={i} width="26" height="12" viewBox="0 0 26 12" className="absolute" style={{ top: i * 22, left: 0, animation: `fly ${70 + i * 18}s linear ${i * 9}s infinite`, color: "var(--ink)" }}>
              <path d="M1 8 Q7 0 13 7 Q19 0 25 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ transformOrigin: "13px 7px", animation: "flap 1.4s ease-in-out infinite" }} />
            </svg>
          ))}
        </div>
      )}
      {/* soft vignette keeps text readable */}
      <div className="absolute inset-0" style={{ background: sky.tone === "night" ? "radial-gradient(120% 90% at 50% 0%, transparent 40%, rgba(5,8,25,.35))" : "radial-gradient(120% 90% at 50% 0%, transparent 55%, rgba(255,255,255,.18))" }} />
    </div>
  );
}
