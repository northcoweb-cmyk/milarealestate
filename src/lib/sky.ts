import { ambientAt, coordsFromTimezone, sunTimes, type Ambient } from "./sun";
import { partsIn, zonedToUtc } from "./time";

/**
 * Computes the live sky (colors + celestial positions) from real sunrise and
 * sunset for the user's approximate location. Pure; runs on server and client
 * so first paint already matches the time of day.
 */
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };
const MIN = 60_000;

interface Stop { at: number; top: string; mid: string; bottom: string }

export interface SkyState extends Ambient {
  top: string; mid: string; bottom: string;
  tone: "day" | "night";
  sun: { x: number; y: number; opacity: number; color: string; alt: number };
  /** Cloud shading for the shader: body is slightly shaded, highlight catches the light. */
  cloud: { body: string; highlight: string; coverage: number };
  moon: { x: number; y: number; opacity: number };
}

export function skyAt(now: Date, tz: string, lat?: number | null, lng?: number | null): SkyState {
  const c = lat != null && lng != null ? { lat, lng } : coordsFromTimezone(tz);
  const p = partsIn(now, tz);
  const st = sunTimes(zonedToUtc(p.y, p.m, p.d, 12, 0, tz), c.lat, c.lng);
  const amb = ambientAt(now, st);
  const r = st.sunrise.getTime(), s = st.sunset.getTime(), n = st.solarNoon.getTime();
  const night = { top: "#000000", mid: "#08080a", bottom: "#141416" };
  const stops: Stop[] = st.polar ? [{ at: 0, ...(st.polar === "day" ? { top: "#e4e4e6", mid: "#f1f1f2", bottom: "#fcfcfc" } : night) }] : [
    { at: r - 70 * MIN, ...night },
    { at: r - 25 * MIN, top: "#16161a", mid: "#6b625f", bottom: "#d9a48f" },
    { at: r + 15 * MIN, top: "#c9c9cc", mid: "#efd9cb", bottom: "#fbe7cf" },
    { at: r + 150 * MIN, top: "#e1e1e3", mid: "#f0f0f1", bottom: "#fdf6ec" },
    { at: n, top: "#dcdcdf", mid: "#eeeeef", bottom: "#fbfbfb" },
    { at: s - 150 * MIN, top: "#e0e0e2", mid: "#f0f0f1", bottom: "#fcf4e8" },
    { at: s - 40 * MIN, top: "#bdbdc2", mid: "#f0cdb4", bottom: "#fbd9ae" },
    { at: s + 5 * MIN, top: "#5b5b60", mid: "#d1a090", bottom: "#eeb994" },
    { at: s + 50 * MIN, top: "#1c1c20", mid: "#4a4543", bottom: "#8d6e63" },
    { at: s + 100 * MIN, ...night },
  ];
  const t = now.getTime();
  let a = stops[0], b = stops[stops.length - 1];
  if (t <= stops[0].at) b = a; else if (t >= stops[stops.length - 1].at) a = b;
  else for (let i = 0; i < stops.length - 1; i++) if (t >= stops[i].at && t <= stops[i + 1].at) { a = stops[i]; b = stops[i + 1]; break; }
  const k = a === b ? 0 : (t - a.at) / (b.at - a.at);
  const eased = k * k * (3 - 2 * k);
  const top = mix(a.top, b.top, eased), mid = mix(a.mid, b.mid, eased), bottom = mix(a.bottom, b.bottom, eased);

  const prog = Math.min(1, Math.max(0, (t - r) / Math.max(1, s - r)));
  const sunUp = !st.polar || st.polar === "day" ? 1 : 0;
  const sunOpacity = sunUp * Math.min(1, Math.max(0, amb.daylight * 1.4));
  const lum = (0.2126 * rgb(mid)[0] + 0.7152 * rgb(mid)[1] + 0.0722 * rgb(mid)[2]) / 255;

  // Sun colour follows its altitude: deep orange at the horizon -> gold -> pale yellow -> near-white at noon.
  const alt = Math.sin(prog * Math.PI); // 0 at sunrise/sunset, 1 at solar noon
  const sunColor = alt < 0.12 ? mix("#ff6a3d", "#ff9a4d", alt / 0.12)
    : alt < 0.35 ? mix("#ff9a4d", "#ffc766", (alt - 0.12) / 0.23)
    : alt < 0.7 ? mix("#ffc766", "#fff0b8", (alt - 0.35) / 0.35)
    : mix("#fff0b8", "#fffdf2", (alt - 0.7) / 0.3);

  // Clouds pick up the light: pinkish/golden near the horizon, white at midday, faint blue-grey at night.
  const day = Math.min(1, amb.daylight * 1.25);
  const lit = mix("#ffffff", mix("#ffd2b0", "#ffb38a", Math.min(1, amb.warmth)), amb.warmth * 0.85);
  const nightHi = mix(mid, "#9a9a9e", 0.22);
  const highlight = mix(nightHi, lit, day);
  const body = mix(mix(mid, "#a8a8ad", 0.12), mix(lit, mid, 0.34), day);
  const coverage = 0.2 - day * 0.1; // a touch more cloud in full daylight than at night

  return {
    ...amb, top, mid, bottom,
    tone: lum < 0.45 ? "night" : "day",
    sun: { x: 12 + prog * 76, y: Math.max(12, 78 - alt * 58), opacity: sunOpacity, color: sunColor, alt },
    moon: { x: 56, y: 2.5, opacity: Math.max(0, 1 - amb.daylight * 2.2) * 0.9 },
    cloud: { body, highlight, coverage },
  };
}
