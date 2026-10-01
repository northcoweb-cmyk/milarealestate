// Sunrise/sunset (NOAA general solar position equations) and the time-of-day
// "phase" that drives Mila's ambient environment. Pure functions, usable on
// server and client. Needs only an approximate latitude/longitude.

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface SunTimes { sunrise: Date; sunset: Date; solarNoon: Date; polar: "day" | "night" | null }

export function sunTimes(date: Date, lat: number, lng: number): SunTimes {
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const doy = Math.floor((dayStart - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000);
  const g = ((2 * Math.PI) / 365) * (doy - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosH = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
  const noonMin = 720 - 4 * lng - eqTime;
  const solarNoon = new Date(dayStart + noonMin * 60_000);
  if (cosH > 1) return { sunrise: solarNoon, sunset: solarNoon, solarNoon, polar: "night" };
  if (cosH < -1) return { sunrise: new Date(dayStart), sunset: new Date(dayStart + 86_400_000), solarNoon, polar: "day" };
  const ha = deg(Math.acos(cosH));
  return {
    sunrise: new Date(dayStart + (720 - 4 * (lng + ha) - eqTime) * 60_000),
    sunset: new Date(dayStart + (720 - 4 * (lng - ha) - eqTime) * 60_000),
    solarNoon,
    polar: null,
  };
}

export type Phase = "night" | "sunrise" | "morning" | "afternoon" | "sunset" | "evening";

export interface Ambient {
  phase: Phase;
  /** 0 (deep night) .. 1 (full day) — drives brightness continuously. */
  daylight: number;
  /** 0..1 warm glow strength near sunrise/sunset. */
  warmth: number;
  stars: number;
  clouds: number;
  birds: boolean;
}

const MIN = 60_000;
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export function ambientAt(now: Date, st: SunTimes): Ambient {
  const t = now.getTime();
  const rise = st.sunrise.getTime(), set = st.sunset.getTime();
  const twilight = 45 * MIN;
  // daylight eases in over the 45min around sunrise/sunset
  const up = smooth((t - (rise - twilight)) / (twilight * 1.6));
  const down = 1 - smooth((t - (set - twilight * 0.4)) / (twilight * 1.6));
  const daylight = st.polar === "day" ? 1 : st.polar === "night" ? 0 : Math.min(up, down);
  const nearRise = Math.exp(-(((t - rise) / (50 * MIN)) ** 2));
  const nearSet = Math.exp(-(((t - set) / (55 * MIN)) ** 2));
  const warmth = Math.min(1, Math.max(nearRise, nearSet));
  let phase: Phase;
  if (daylight < 0.12) phase = t > set ? "night" : "night";
  else if (Math.abs(t - rise) < 70 * MIN && t < st.solarNoon.getTime()) phase = "sunrise";
  else if (t < st.solarNoon.getTime()) phase = "morning";
  else if (t < set - 80 * MIN) phase = "afternoon";
  else if (t < set + 20 * MIN) phase = "sunset";
  else phase = daylight > 0.3 ? "sunset" : "evening";
  if (phase === "night" && t > set + 20 * MIN && t < set + 75 * MIN) phase = "evening";
  return {
    phase,
    daylight,
    warmth,
    stars: Math.max(0, 1 - daylight * 1.6),
    clouds: daylight > 0.15 ? Math.min(1, 0.35 + daylight * 0.65) : 0,
    birds: phase === "morning" || phase === "sunrise",
  };
}

/** Fallback when no coordinates are known: approximate from timezone only. */
export const DEFAULT_COORDS = { lat: 39.0, lng: -77.2 }; // mid-Atlantic US; refined by timezone below

const TZ_COORDS: Record<string, { lat: number; lng: number }> = {
  "America/New_York": { lat: 40.7, lng: -74.0 },
  "America/Chicago": { lat: 41.9, lng: -87.6 },
  "America/Denver": { lat: 39.7, lng: -105.0 },
  "America/Phoenix": { lat: 33.4, lng: -112.1 },
  "America/Los_Angeles": { lat: 34.05, lng: -118.2 },
  "America/Anchorage": { lat: 61.2, lng: -149.9 },
  "Pacific/Honolulu": { lat: 21.3, lng: -157.9 },
};

export function coordsFromTimezone(tz: string) {
  return TZ_COORDS[tz] ?? DEFAULT_COORDS;
}
