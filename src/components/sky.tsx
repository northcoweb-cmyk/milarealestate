"use client";

import { useEffect, useMemo, useState } from "react";
import { skyAt, type SkyState } from "@/lib/sky";
import Cloudscape from "@/components/ui/cloudscape";

interface Props { initialNow: string; tz: string; lat?: number | null; lng?: number | null; theme?: "auto" | "day" | "night"; reduceMotion?: boolean; animated?: boolean }

const STARS = Array.from({ length: 46 }, (_, i) => ({ x: (i * 53.7) % 100, y: (i * 31.3) % 70, s: 1 + ((i * 7) % 3) * 0.6, d: (i % 7) * 0.9 + 2.5 }));

export function Sky({ initialNow, tz, lat, lng, theme = "auto", reduceMotion = false, animated = false }: Props) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const [osReduce, setOsReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduce(mq.matches);
    const h = () => setOsReduce(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  // Clouds are a still image by default (one draw, zero ongoing cost). Animation is opt-in under Settings → Appearance.
  const still = reduceMotion || osReduce || !animated;
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
  const sunScale = 1 + (1 - sky.sun.alt) * 0.4; // the sun looks bigger and softer near the horizon
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 overflow-hidden" style={{ height: "100lvh", minHeight: "100vh", background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.mid} 52%, ${sky.bottom} 100%)` }}>
      {/* moving clouds (WebGL). The gradient above is the no-WebGL fallback. */}
      <Cloudscape
        height="100%" className="absolute inset-0 bg-transparent" style={{ transform: "translateZ(0)" }}
        colorBottom={sky.bottom} skyMid={sky.mid} skyTop={sky.top}
        colorMid={sky.cloud.body} colorTop={sky.cloud.highlight} coverage={sky.cloud.coverage}
        speed={0.45} fps={24} renderScale={0.5} paused={still}
      />
      {/* night: soft blue and purple cloud glow so the dark sky still feels like the website */}
      {sky.tone === "night" && <div className="absolute inset-0" style={{ background: "radial-gradient(70% 45% at 15% 78%, rgba(143,180,255,.42), transparent 70%), radial-gradient(75% 50% at 88% 62%, rgba(166,140,255,.45), transparent 70%), radial-gradient(60% 40% at 50% 100%, rgba(122,104,235,.5), transparent 75%)" }} />}
      {/* horizon glow */}
      <div className="absolute inset-x-0 bottom-0 h-[55%]" style={{ opacity: 0.25 + warmGlow * 0.55, background: `radial-gradient(120% 80% at ${sky.sun.x}% 100%, ${sky.sun.color}cc, transparent 70%)` }} />
      {/* sun: wide glow + defined disc, colour follows altitude (orange at the horizon, near-white at noon) */}
      <div className="absolute" style={{ left: `${sky.sun.x}%`, top: `${sky.sun.y}%`, width: 520 * sunScale, height: 520 * sunScale, marginLeft: -260 * sunScale, marginTop: -260 * sunScale, opacity: sky.sun.opacity * 0.9, background: `radial-gradient(closest-side, ${sky.sun.color} 0%, ${sky.sun.color}99 12%, ${sky.sun.color}33 40%, transparent 72%)` }} />
      <div className="absolute rounded-full" style={{ left: `${sky.sun.x}%`, top: `${sky.sun.y}%`, width: 74 * sunScale, height: 74 * sunScale, marginLeft: -37 * sunScale, marginTop: -37 * sunScale, opacity: Math.min(1, sky.sun.opacity * 1.2), background: `radial-gradient(circle, #ffffff 0%, ${sky.sun.color} 55%, ${sky.sun.color}00 100%)`, filter: "blur(1.5px)" }} />
      {/* moon */}
      <div className="absolute rounded-full" style={{ left: `${sky.moon.x}%`, top: `${sky.moon.y}%`, width: 44, height: 44, marginLeft: -22, opacity: sky.moon.opacity, background: "radial-gradient(circle at 35% 35%, #fffdf2, #ececec 60%, #bdbdc0)", boxShadow: "0 0 60px 10px rgba(255,255,255,.3)" }} />
      {/* stars: fade in as the sky darkens */}
      <div className="absolute inset-0" style={{ opacity: sky.stars }}>
        {STARS.map((s, i) => (
          <span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: 0.55 + (s.d % 3) * 0.2 }} />
        ))}
      </div>
      {/* soft vignette keeps text readable */}
      <div className="absolute inset-0" style={{ background: sky.tone === "night" ? "radial-gradient(120% 90% at 50% 0%, transparent 40%, rgba(5,8,25,.35))" : "radial-gradient(120% 90% at 50% 0%, transparent 55%, rgba(255,255,255,.18))" }} />
    </div>
  );
}
