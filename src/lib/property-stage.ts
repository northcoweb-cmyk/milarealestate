import type { CalendarEvent, Memory, Property, PropertyImage } from "./types";
import type { LookupMemory } from "./agent/property-lookup";
import { kindForProperty, type PropertyKind } from "./property-kind";

/**
 * Where each home is in its life, worked out from what Mila already knows (no extra data to keep up):
 *   upcoming        — saved and being prepped; not on the market yet
 *   active          — live: open houses / showings scheduled, or the listing is active
 *   under_contract  — an accepted offer with a closing date
 *   sold            — closed
 *   archived        — set aside by the agent
 * The agent can override the stage by hand (stored as a "Stage" memory), and that always wins.
 */
export type Stage = "upcoming" | "active" | "under_contract" | "sold" | "archived";
export type Group = "upcoming" | "current" | "past";
export const STAGES: { key: Stage; label: string; group: Group; blurb: string }[] = [
  { key: "upcoming", label: "Upcoming", group: "upcoming", blurb: "Getting ready — not on the market yet" },
  { key: "active", label: "Live", group: "current", blurb: "On the market / open houses and showings" },
  { key: "under_contract", label: "Under contract", group: "current", blurb: "Offer accepted, heading to closing" },
  { key: "sold", label: "Sold", group: "past", blurb: "Closed" },
  { key: "archived", label: "Archived", group: "past", blurb: "Set aside" },
];
export const STAGE_KEY = "Stage";
export const TXN_KEY = "Transaction";

export interface PropertyCardInfo extends Property {
  stage: Stage; stage_label: string; group: Group; manual_stage: boolean;
  /** "on" = listed and available right now; "off" = everything else (prepping, under contract, sold, set aside) */
  market: "on" | "off";
  next: { title: string; start_at: string; kind: string } | null;
  closing_at: string | null; sold_price: number | null; sold_note: string | null;
  est_value: number | null; days_on_market: number | null; year_built: number | null; property_type: string | null; list_status: string | null;
  kind: PropertyKind;
  image: string | null; image_source: "photo" | "street" | null; has_data: boolean;
}

const isStage = (v: string): v is Stage => STAGES.some((s) => s.key === v);

export function buildCard(p: Property, mems: Memory[], events: CalendarEvent[], images: PropertyImage[], now: Date): PropertyCardInfo {
  const mine = mems.filter((m) => m.scope === "property" && m.subject_id === p.id);
  const txn = mine.find((m) => m.key === TXN_KEY)?.value ?? "";
  const manual = mine.find((m) => m.key === STAGE_KEY)?.value ?? "";
  let lookup: LookupMemory | null = null;
  try { const raw = mems.find((m) => m.key === `cache:property_lookup:${p.id}`)?.value; lookup = raw ? (JSON.parse(raw) as LookupMemory) : null; } catch { /* ignore */ }
  const x = lookup?.extra;
  const ev = events.filter((e) => e.property_id === p.id && e.status === "confirmed");
  const t = now.getTime();
  const future = ev.filter((e) => new Date(e.end_at).getTime() > t).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const next = future.find((e) => e.notes !== "Transaction milestone" || e.kind === "closing") ?? future[0] ?? null;
  const closing = future.find((e) => e.kind === "closing") ?? null;
  const recentShowing = ev.some((e) => (e.kind === "open_house" || e.kind === "showing") && new Date(e.start_at).getTime() > t - 30 * 86_400_000);
  const soldPrice = /^Sold/i.test(txn) ? Number(/\$([\d,]+)/.exec(txn)?.[1]?.replace(/,/g, "")) || null : null;

  let stage: Stage;
  let isManual = false;
  if (isStage(manual)) { stage = manual; isManual = true; }
  else if (/^Sold/i.test(txn)) stage = "sold";
  else if (/^Under contract/i.test(txn)) stage = "under_contract";
  else if (x?.list_status === "Active" || recentShowing) stage = "active";
  else stage = "upcoming";

  const photo = images[0]?.url ?? null;
  const street = !photo && p.city && p.state ? `/api/properties/${p.id}/streetview?size=640x440` : null;
  const def = STAGES.find((s) => s.key === stage)!;
  return {
    ...p, kind: kindForProperty(p, mems), stage, stage_label: def.label, group: def.group, manual_stage: isManual, market: stage === "active" ? "on" : "off",
    next: next ? { title: next.title, start_at: next.start_at, kind: next.kind } : null,
    closing_at: closing?.start_at ?? null, sold_price: soldPrice, sold_note: /^Sold/i.test(txn) ? txn.replace(/^Sold\s*(\$[\d,]+)?\s*·?\s*/i, "").trim() || null : null,
    est_value: x?.est_value ?? null, days_on_market: x?.days_on_market ?? null, year_built: x?.year_built ?? null, property_type: x?.property_type ?? null, list_status: x?.list_status ?? null,
    image: photo ?? street, image_source: photo ? "photo" : street ? "street" : null, has_data: Boolean(p.list_price || p.beds || p.baths || p.sqft),
  };
}

const rank: Record<Stage, number> = { under_contract: 0, active: 1, upcoming: 2, sold: 3, archived: 4 };
/** Most important first: closing soonest, then live, then prepping; within a group, whatever is next on the calendar comes first. */
export function sortCards(cards: PropertyCardInfo[]): PropertyCardInfo[] {
  return [...cards].sort((a, b) => rank[a.stage] - rank[b.stage] || (a.next?.start_at ?? "9") .localeCompare(b.next?.start_at ?? "9") || b.created_at.localeCompare(a.created_at));
}
