// What kind of property is this? A 3-bed house, a duplex, a strip mall and a 20-acre lot are different jobs: different numbers matter, different
// questions get asked, and different words go in a post. This reads the agent's own words first, then the public-records type, then the address and the numbers.
import type { Memory, Property } from "./types";

export type KindGroup = "residential" | "multifamily" | "commercial" | "land" | "unknown";

export interface PropertyKind {
  group: KindGroup;
  /** "Single-family home", "Condo", "Duplex", "Retail space", "Land" … */
  label: string;
  /** one short line on what makes this kind different */
  note: string;
  /** what matters for this kind, in the order an agent talks about it */
  matters: string[];
  /** where the call came from */
  basis: "agent" | "records" | "address" | "numbers" | "none";
}

interface Input { address?: string | null; beds?: number | null; baths?: number | null; sqft?: number | null; description?: string | null; typeHint?: string | null; agentText?: string | null }

const RES = "price, beds, baths, square feet";
const NOTES: Record<KindGroup, { note: string; matters: string[] }> = {
  residential: { note: "A home someone will live in: buyers compare beds, baths, size and neighborhood.", matters: ["price", "beds", "baths", "square feet", "lot size", "year built", "HOA (condos and townhomes)"] },
  multifamily: { note: "1 to 4 units: buyers look at the rents and the numbers, not just the bedrooms. Up to 4 units still qualifies for a residential loan.", matters: ["price", "number of units", "total square feet", "rent per unit", "occupancy", "expenses and net income"] },
  commercial: { note: "A property for business or investment: it sells on income, zoning and lease terms. Beds and baths don't apply, and commercial financing is different.", matters: ["asking price or lease rate", "building square feet", "zoning", "cap rate or net income", "lease type (NNN, gross)", "tenants and occupancy", "parking"] },
  land: { note: "Vacant land: it sells on acreage, zoning and what can be built. Utilities, road access and a survey drive the price.", matters: ["asking price", "acreage", "zoning", "utilities", "road access", "survey and flood zone"] },
  unknown: { note: "I don't know the type yet. Tell me (house, condo, duplex, commercial, land) and I'll ask for the right details.", matters: [RES] },
};

const COMMERCIAL_WORDS = /\b(commercial|office|retail|warehouse|industrial|storefront|store ?front|shopping (?:center|centre)|strip (?:mall|center)|restaurant|medical (?:office|building)|mixed[- ]use|self[- ]storage|hotel|motel|gas station|flex space|business park|car wash|hospitality)\b/i;
const LAND_WORDS = /\b(vacant (?:land|lot)|land|lot|acres?|parcel|farm|ranch|acreage|raw land|timber)\b/i;
const MULTI_WORDS = /\b(duplex|triplex|fourplex|quadplex|4-?plex|3-?plex|2-?4 unit|multi[- ]?family|multi[- ]?unit|apartment (?:building|complex|community)|(\d+)[- ]units?)\b/i;

function commercialLabel(s: string): string {
  const t = s.toLowerCase();
  if (/mixed[- ]use/.test(t)) return "Mixed-use building";
  if (/office|medical/.test(t)) return "Office space";
  if (/retail|storefront|store front|shopping|strip|restaurant|car wash|gas station/.test(t)) return "Retail space";
  if (/warehouse|industrial|flex|self[- ]storage/.test(t)) return "Industrial / warehouse";
  if (/hotel|motel|hospitality/.test(t)) return "Hospitality";
  return "Commercial property";
}

function residentialLabel(s: string): string {
  const t = s.toLowerCase();
  if (/condo|co-?op/.test(t)) return "Condo";
  if (/town ?home|town ?house/.test(t)) return "Townhome";
  if (/manufactured|mobile/.test(t)) return "Manufactured home";
  return "Single-family home";
}

function make(group: KindGroup, label: string, basis: PropertyKind["basis"]): PropertyKind { return { group, label, note: NOTES[group].note, matters: NOTES[group].matters, basis }; }

/** Look at the words (the agent's, then the records' type), then the address, then the numbers. */
export function classifyProperty(i: Input): PropertyKind {
  const said = `${i.agentText ?? ""} ${i.description ?? ""}`.replace(/\b\d{1,6}\s+[a-z0-9'.]+(?:\s+[a-z0-9'.]+){0,3}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|boulevard|pl|place|pkwy|parkway|hwy|highway|trl|trail|loop)\b/gi, " "); // a street named "Lake" or "Farm" is not a lot
  const fromRecords = i.typeHint ?? "";
  for (const [src, basis] of [[said, "agent"], [fromRecords, "records"]] as const) {
    if (!src.trim()) continue;
    if (COMMERCIAL_WORDS.test(src)) return make("commercial", commercialLabel(src), basis);
    const m = MULTI_WORDS.exec(src);
    if (m) {
      const units = m[2] ? Number(m[2]) : /triplex|3-?plex/i.test(m[0]) ? 3 : /fourplex|quadplex|4-?plex/i.test(m[0]) ? 4 : /duplex/i.test(m[0]) ? 2 : null;
      if (units != null && units >= 5) return make("commercial", `${units}-unit apartment building`, basis); // 5+ units are financed as commercial
      return make("multifamily", units === 2 ? "Duplex" : units === 3 ? "Triplex" : units === 4 ? "Fourplex" : "Multifamily (2–4 units)", basis);
    }
    if (/\b(vacant (?:land|lot)|raw land|acreage|ranch|farm|timber)\b/i.test(src) || (basis === "records" && /^\s*land\s*$/i.test(src)) || (basis === "agent" && /\b(?:is|it'?s|a|an|the)\s+(?:vacant\s+)?(?:land|lot|parcel)\b|\b\d+(?:\.\d+)?\s*acres?\b/i.test(src))) return make("land", "Land", basis);
    if (/\b(condo|co-?op|town ?home|town ?house|single[- ]family|house|home|manufactured|mobile home|apartment)\b/i.test(src)) return make("residential", residentialLabel(src), basis);
  }
  const addr = i.address ?? "";
  if (/\b(suite|ste\.?|floor|fl\.?|bldg|building)\s*#?\w+/i.test(addr)) return make("commercial", "Commercial property", "address");
  if (/(?:#|\bunit\b|\bapt\.?\b)\s*\w+/i.test(addr)) return make("residential", "Condo", "address");
  if (i.beds != null || i.baths != null) return make("residential", "Single-family home", "numbers");
  return make("unknown", "Property", "none");
}

/** The numbers that fit this kind, for a card or a caption. */
export function kindFacts(k: PropertyKind, p: { beds?: number | null; baths?: number | null; sqft?: number | null; list_price?: number | null }, money: (n: number) => string): string[] {
  const out: string[] = [];
  if (k.group === "residential" || k.group === "unknown") { if (p.beds) out.push(`${p.beds} bed`); if (p.baths) out.push(`${p.baths} bath`); }
  if (p.sqft) out.push(`${p.sqft.toLocaleString("en-US")} sq ft`);
  if (p.list_price) out.push(k.group === "commercial" ? `Asking ${money(p.list_price)}` : `Offered at ${money(p.list_price)}`);
  return out;
}

/** What's still blank for this kind. Beds and baths are never asked about for a warehouse or a lot. */
export function kindMissing(k: PropertyKind, p: { beds?: number | null; baths?: number | null; sqft?: number | null; list_price?: number | null }): string[] {
  const m: string[] = [];
  if (p.list_price == null) m.push(k.group === "commercial" ? "asking price (or lease rate)" : "price");
  if (k.group === "residential" || k.group === "unknown") { if (p.beds == null) m.push("beds"); if (p.baths == null) m.push("baths"); }
  if (p.sqft == null && k.group !== "land") m.push(k.group === "commercial" ? "building square feet" : "square feet");
  if (k.group === "land") m.push("acreage", "zoning");
  if (k.group === "commercial") m.push("zoning");
  return m;
}

/** A short line that shows how this kind differs, for the reply when a property is saved. */
export function kindLine(k: PropertyKind): string | null {
  if (k.group === "unknown" || (k.group === "residential" && k.label === "Single-family home")) return null;
  return `${k.label}. ${k.note}`;
}

export const KIND_KEY = "Property type";
const LOOKUP_PREFIX = "cache:property_lookup:";

/** The kind of a saved property: what the agent said (remembered), then the type in the public records, then the address and numbers. */
export function kindForProperty(p: Property, mems: Memory[], agentText?: string | null): PropertyKind {
  const said = mems.find((m) => m.scope === "property" && m.subject_id === p.id && m.key === KIND_KEY)?.value ?? null;
  let hint: string | null = null;
  try {
    const raw = mems.find((m) => m.key === `${LOOKUP_PREFIX}${p.id}`)?.value;
    if (raw) { const l = JSON.parse(raw) as { extra?: { property_type?: string | null }; facts?: { type?: string | null } | null }; hint = l.extra?.property_type ?? l.facts?.type ?? null; }
  } catch { /* ignore a bad cache entry */ }
  return classifyProperty({ address: p.address, beds: p.beds, baths: p.baths, sqft: p.sqft, description: p.description, typeHint: hint, agentText: [said, agentText].filter(Boolean).join(" ") });
}
