import type { MediaQuery } from "./types";

const SUFFIX: Record<string, string> = {
  street: "ST", st: "ST", avenue: "AVE", ave: "AVE", av: "AVE", boulevard: "BLVD", blvd: "BLVD", road: "RD", rd: "RD", drive: "DR", dr: "DR", lane: "LN", ln: "LN", court: "CT", ct: "CT",
  circle: "CIR", cir: "CIR", place: "PL", pl: "PL", terrace: "TER", ter: "TER", trail: "TRL", trl: "TRL", parkway: "PKWY", pkwy: "PKWY", highway: "HWY", hwy: "HWY", way: "WAY", square: "SQ", sq: "SQ", loop: "LOOP", alley: "ALY", aly: "ALY",
};
const DIR: Record<string, string> = { north: "N", south: "S", east: "E", west: "W", northeast: "NE", northwest: "NW", southeast: "SE", southwest: "SW", n: "N", s: "S", e: "E", w: "W", ne: "NE", nw: "NW", se: "SE", sw: "SW" };
const UNIT_WORDS = /\b(?:apartment|apt|unit|suite|ste|#|no\.?|number|bldg|building|floor|fl)\b\.?\s*/gi;

/** "123 N. Main Street, Apt 4B" -> { street: "123 N MAIN ST", unit: "4B" } */
export function normalizeStreet(raw: string): { street: string; unit: string } {
  let s = ` ${raw} `.replace(/[.,]/g, " ");
  let unit = "";
  const u = /\s(?:apartment|apt|unit|suite|ste|bldg|building|floor|fl)\s*#?\s*([a-z0-9-]+)\s*$/i.exec(s) ?? /\s#\s*([a-z0-9-]+)\s*$/i.exec(s);
  if (u) { unit = u[1].toUpperCase(); s = s.slice(0, u.index); }
  s = s.replace(UNIT_WORDS, " ");
  const words = s.trim().split(/\s+/).filter(Boolean).map((w) => w.toLowerCase().replace(/[^a-z0-9-]/g, "")).filter(Boolean);
  const out = words.map((w, i) => {
    if (i > 0 && DIR[w] && (i === 1 || i === words.length - 1 || SUFFIX[words[i - 1]] !== undefined)) return DIR[w]; // directional, not part of a street name like "West Ave" at position 1 handled the same
    if (i === words.length - 1 || (i === words.length - 2 && DIR[words[words.length - 1]])) return SUFFIX[w] ?? w.toUpperCase();
    return w.toUpperCase().replace(/^(\d+)(ST|ND|RD|TH)$/, "$1$2");
  });
  return { street: out.join(" "), unit };
}

export const normalizeZip = (z?: string | null) => (/\b(\d{5})(?:-\d{4})?\b/.exec(z ?? "")?.[1] ?? "");
const clean = (v?: string | null) => (v ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Stable key: street (+unit) | city | state | zip. Two different homes never share a key; the same home always does. */
export function addressKey(q: Pick<MediaQuery, "address" | "city" | "state" | "zip">): string {
  const { street, unit } = normalizeStreet(q.address);
  return [unit ? `${street} #${unit}` : street, clean(q.city), clean(q.state).slice(0, 2), normalizeZip(q.zip)].join("|");
}

/** Do two addresses name the same home? Street number, street name and unit must match exactly; ZIP must match when both are known, else city+state. */
export function sameHome(a: Pick<MediaQuery, "address" | "city" | "state" | "zip">, b: Pick<MediaQuery, "address" | "city" | "state" | "zip">): boolean {
  const [sa, sb] = [normalizeStreet(a.address), normalizeStreet(b.address)];
  if (!sa.street || sa.street !== sb.street || sa.unit !== sb.unit) return false;
  const [za, zb] = [normalizeZip(a.zip), normalizeZip(b.zip)];
  if (za && zb) return za === zb;
  return clean(a.city) === clean(b.city) && clean(a.state).slice(0, 2) === clean(b.state).slice(0, 2) && Boolean(clean(a.city));
}

export const fullAddress = (q: Pick<MediaQuery, "address" | "city" | "state" | "zip">) => [q.address, q.city, [q.state, q.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
