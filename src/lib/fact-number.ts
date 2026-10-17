/** Parses a typed property number strictly. "$1,250,000" is fine; "abc$!" or "999 beds" is an error with a reason, never a quiet 0. */
export type FactRule = { label: string; max: number; whole?: boolean; half?: boolean };
export const FACT_RULES = {
  list_price: { label: "Price", max: 1_000_000_000 },
  beds: { label: "Beds", max: 50, whole: true },
  baths: { label: "Baths", max: 50, half: true },
  sqft: { label: "Sq ft", max: 1_000_000, whole: true },
} as const satisfies Record<string, FactRule>;

export function parseFact(raw: string, rule: FactRule): { value: number | null } | { error: string } {
  const s = String(raw ?? "").trim();
  if (s === "") return { value: null };
  if (!/^\$?\s*\d[\d,]*(\.\d+)?$/.test(s)) return { error: `${rule.label}: enter a number (like 1,250,000)` };
  const n = Number(s.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return { error: `${rule.label}: enter a number` };
  if (n < 0) return { error: `${rule.label} can't be negative` };
  if (n > rule.max) return { error: `${rule.label} can't be more than ${rule.max.toLocaleString()}` };
  if (rule.whole && !Number.isInteger(n)) return { error: `${rule.label} must be a whole number` };
  if (rule.half && Math.round(n * 2) !== n * 2) return { error: `${rule.label} must be a whole or half number (like 2.5)` };
  return { value: n };
}
