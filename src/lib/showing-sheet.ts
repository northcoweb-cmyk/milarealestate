/**
 * Showing sheet: a thorough walkthrough checklist an agent (or their buyer) fills out on a phone while touring a home.
 * Each item has a state, a note and photos/videos. This is a buyer's aid, not a home inspection.
 */
export type ItemState = "todo" | "ok" | "issue" | "na";
export interface ItemEntry { state: ItemState; note?: string; media?: string[] }
export interface CustomItem { id: string; section: string; label: string }
export interface SheetData {
  v: 1; kind: "showing_sheet"; status: "in_progress" | "complete";
  property_id: string; event_id: string | null; contact_id: string | null;
  started_at: string; completed_at: string | null;
  items: Record<string, ItemEntry>; custom: CustomItem[];
  overall_note: string; media: string[];
}

export interface SectionDef { key: string; title: string; emoji: string; blurb: string; items: { id: string; label: string; hint?: string }[] }

const I = (id: string, label: string, hint?: string) => ({ id, label, hint });
export const SECTIONS: SectionDef[] = [
  { key: "exterior", title: "Outside & curb appeal", emoji: "🏡", blurb: "Walk the whole perimeter before you go in.", items: [
    I("ext-roof", "Roof condition", "Missing, curled or cracked shingles; sagging; moss. Ask its age."),
    I("ext-siding", "Siding, brick or paint", "Cracks, rot, peeling, stains."),
    I("ext-gutters", "Gutters & downspouts", "Attached, clear, draining away from the house."),
    I("ext-windows", "Windows & doors from outside", "Seals, cracked glass, rot, working locks."),
    I("ext-foundation", "Foundation (outside)", "Cracks wider than a pencil, bowing, water marks."),
    I("ext-grade", "Ground slopes away from the house", "Water should drain away, not toward the walls."),
    I("ext-drive", "Driveway & walkways", "Cracks, heaving, trip hazards."),
    I("ext-deck", "Deck, porch, patio, fence", "Rot, loose rails, soft boards."),
    I("ext-garage", "Garage & garage door", "Opener works, door reverses, floor cracks."),
    I("ext-trees", "Trees & landscaping near the house", "Roots near foundation, branches over roof."),
    I("ext-pests", "Signs of pests", "Droppings, mud tubes, chewed wood, nests."),
  ] },
  { key: "systems", title: "Systems & structure", emoji: "🛠️", blurb: "The expensive stuff. Ask ages and service history.", items: [
    I("sys-hvac", "Heating & cooling", "Type, age, turns on and heats/cools, filter, thermostat."),
    I("sys-waterheater", "Water heater", "Age on the label, leaks, rust, hot water arrives quickly."),
    I("sys-panel", "Electrical panel", "Labeled breakers, no scorch marks, modern breakers."),
    I("sys-outlets", "Outlets & switches", "Test several; GFCI in kitchen, baths, garage, outdoors."),
    I("sys-lights", "Lights & fixtures work", "Flip every switch you pass."),
    I("sys-plumbing", "Water pressure & drains", "Run taps and flush; check for slow drains."),
    I("sys-pipes", "Visible pipes", "Leaks, green corrosion, material (copper, PEX, galvanized)."),
    I("sys-sump", "Sump pump / drainage", "If there is one: works, discharge line, backup."),
    I("sys-detectors", "Smoke & CO detectors", "Present on each level and near bedrooms."),
    I("sys-doors", "Doors stick or windows won't open", "Can signal foundation movement."),
    I("sys-smell", "Musty or chemical smell", "Mold, pets, smoke or cover-up air fresheners."),
  ] },
  { key: "kitchen", title: "Kitchen", emoji: "🍳", blurb: "Open everything. Run everything.", items: [
    I("k-appliances", "Appliances work & which stay", "Oven, range, fridge, dishwasher, microwave."),
    I("k-sink", "Sink, faucet & under-sink", "Leaks, stains, soft cabinet floor."),
    I("k-disposal", "Disposal & dishwasher run", ""),
    I("k-vent", "Range hood / ventilation", "Vents outside or just recirculates."),
    I("k-counters", "Counters & cabinets", "Damage, doors/drawers align and close."),
    I("k-storage", "Pantry & storage", ""),
    I("k-outlets", "Outlets at counters", "Enough, GFCI-protected."),
  ] },
  { key: "baths", title: "Bathrooms", emoji: "🚿", blurb: "Check every bathroom, not just the main one.", items: [
    I("b-toilets", "Toilets flush & are stable", "Rock the base; check for leaks."),
    I("b-shower", "Shower / tub drain and pressure", "Run it; watch how fast it drains."),
    I("b-hot", "Hot water arrives", "How long does it take?"),
    I("b-leaks", "Leaks, stains or soft floor", "Under sinks, around the tub, ceiling below."),
    I("b-caulk", "Caulk, grout & tile", "Cracked, missing or moldy."),
    I("b-fan", "Exhaust fan works", "Moisture control."),
  ] },
  { key: "rooms", title: "Bedrooms & living areas", emoji: "🛏️", blurb: "Imagine living here.", items: [
    I("r-layout", "Layout & flow works for the buyer", ""),
    I("r-closets", "Closets & storage", ""),
    I("r-windows", "Windows open, close & seal", ""),
    I("r-floors", "Floors: level, squeaks, damage", "Bring a marble or phone level."),
    I("r-ceilings", "Ceilings & walls: stains or cracks", "Water stains, new paint in odd spots."),
    I("r-light", "Natural light", ""),
    I("r-noise", "Noise from outside or next door", "Stand quiet for 30 seconds."),
    I("r-signal", "Cell signal & internet options", "Check bars in a few rooms; ask providers."),
  ] },
  { key: "basement", title: "Basement, attic & laundry", emoji: "🧺", blurb: "Where hidden problems show up.", items: [
    I("bs-moisture", "Moisture, water lines or efflorescence", "White powdery stains on walls."),
    I("bs-smell", "Musty smell", ""),
    I("bs-foundation", "Foundation walls inside", "Cracks, patches, bowing."),
    I("bs-attic", "Attic insulation & ventilation", "Depth of insulation, daylight through roof, stains."),
    I("bs-laundry", "Laundry hookups & dryer vent", "Vents outside, washer hookup, drain."),
    I("bs-headroom", "Ceiling height & finished space", "Permitted? Egress windows?"),
  ] },
  { key: "lot", title: "Yard & neighborhood", emoji: "🌳", blurb: "You can't move the location.", items: [
    I("l-lot", "Lot size & boundaries", "Fences vs. actual lines."),
    I("l-drain", "Standing water or drainage problems", ""),
    I("l-neighbors", "Neighboring properties' condition", ""),
    I("l-noise", "Road, train or airport noise", "Visit at rush hour if you can."),
    I("l-parking", "Parking & street", "Driveway, garage, street parking rules."),
    I("l-commute", "Commute, shops & schools nearby", ""),
    I("l-flood", "Flood zone / insurance", "Ask; verify with the county map."),
  ] },
  { key: "confirm", title: "Confirm with the seller or listing agent", emoji: "📋", blurb: "Ask, write the answer in the note.", items: [
    I("c-year", "Year built & major updates", "Roof, HVAC, windows, kitchen, baths."),
    I("c-ages", "Age of roof, HVAC and water heater", ""),
    I("c-why", "Why are they selling?", ""),
    I("c-dom", "Days on market & any price changes", ""),
    I("c-offers", "Other offers or deadlines", ""),
    I("c-hoa", "HOA fees, rules & assessments", "Ask for documents."),
    I("c-taxes", "Property taxes & utility costs", "Last 12 months."),
    I("c-included", "What's included / excluded", "Appliances, window treatments, fixtures."),
    I("c-disclosures", "Known defects & seller disclosures", "Request in writing."),
    I("c-permits", "Permits for additions or major work", ""),
    I("c-lead", "Lead paint (built before 1978)", ""),
    I("c-possession", "Possession date & showing rules", ""),
  ] },
  { key: "fit", title: "Buyer fit & gut check", emoji: "🎯", blurb: "Does this house match what they asked for?", items: [
    I("f-musthaves", "Meets the must-haves", ""),
    I("f-price", "Price feels right vs. similar homes", ""),
    I("f-repairs", "Repairs / updates they'd need to budget", ""),
    I("f-feel", "How it felt to be there", ""),
    I("f-next", "Next step: offer, second showing or pass", ""),
  ] },
];

export const allItems = (custom: CustomItem[] = []) => [
  ...SECTIONS.flatMap((s) => s.items.map((i) => ({ ...i, section: s.key, custom: false }))),
  ...custom.map((c) => ({ id: c.id, label: c.label, hint: "", section: c.section, custom: true })),
];

export const emptySheet = (propertyId: string, now: Date, o: { eventId?: string | null; contactId?: string | null } = {}): SheetData => ({
  v: 1, kind: "showing_sheet", status: "in_progress", property_id: propertyId, event_id: o.eventId ?? null, contact_id: o.contactId ?? null,
  started_at: now.toISOString(), completed_at: null, items: {}, custom: [], overall_note: "", media: [],
});

export const isSheet = (x: unknown): x is SheetData => !!x && typeof x === "object" && (x as SheetData).kind === "showing_sheet";

export function progress(sheet: SheetData) {
  const items = allItems(sheet.custom);
  const st = (id: string) => sheet.items[id]?.state ?? "todo";
  const done = items.filter((i) => st(i.id) === "ok" || st(i.id) === "na").length + items.filter((i) => st(i.id) === "issue").length;
  const issues = items.filter((i) => st(i.id) === "issue").length;
  const withMedia = items.filter((i) => (sheet.items[i.id]?.media?.length ?? 0) > 0).length;
  return { total: items.length, done, issues, ok: items.filter((i) => st(i.id) === "ok").length, na: items.filter((i) => st(i.id) === "na").length, withMedia, mediaCount: sheet.media.length + Object.values(sheet.items).reduce((n, e) => n + (e.media?.length ?? 0), 0) };
}

const ALLOWED: ItemState[] = ["todo", "ok", "issue", "na"];
/** Validates and merges a partial update from the client. Unknown ids and oversized text are dropped. */
export function mergeSheet(cur: SheetData, patch: { items?: Record<string, Partial<ItemEntry>>; custom?: CustomItem[]; overall_note?: string; media?: string[] }): SheetData {
  const next: SheetData = { ...cur, items: { ...cur.items }, custom: cur.custom, media: cur.media };
  if (patch.custom) next.custom = patch.custom.slice(0, 60).map((c) => ({ id: String(c.id).slice(0, 40), section: SECTIONS.some((s) => s.key === c.section) ? c.section : "fit", label: String(c.label).trim().slice(0, 120) })).filter((c) => /^x-[\w-]+$/.test(c.id) && c.label);
  const valid = new Set(allItems(next.custom).map((i) => i.id));
  for (const [id, e] of Object.entries(patch.items ?? {})) {
    if (!valid.has(id)) continue;
    const prev = next.items[id] ?? { state: "todo" as ItemState };
    next.items[id] = {
      state: e.state && ALLOWED.includes(e.state) ? e.state : prev.state,
      note: e.note !== undefined ? String(e.note).slice(0, 4000) : prev.note,
      media: e.media !== undefined ? e.media.filter((m) => /^[\w-]{8,64}$/.test(m)).slice(0, 30) : prev.media,
    };
  }
  if (patch.overall_note !== undefined) next.overall_note = String(patch.overall_note).slice(0, 8000);
  if (patch.media) next.media = patch.media.filter((m) => /^[\w-]{8,64}$/.test(m)).slice(0, 60);
  return next;
}

/** Plain-text summary: what was flagged, what was noted, what's still open. Used for notes, sharing and search. */
export function summarize(sheet: SheetData, address: string, when: string): string {
  const p = progress(sheet);
  const items = allItems(sheet.custom);
  const line = (i: { id: string; label: string }) => { const e = sheet.items[i.id]; return `• ${i.label}${e?.note ? ` — ${e.note.trim()}` : ""}${e?.media?.length ? ` (${e.media.length} photo/video${e.media.length > 1 ? "s" : ""})` : ""}`; };
  const out: string[] = [`Showing sheet — ${address}`, when, `${p.done} of ${p.total} checked · ${p.issues} flagged · ${p.mediaCount} photos/videos`, ""];
  const flagged = items.filter((i) => sheet.items[i.id]?.state === "issue");
  if (flagged.length) out.push("NEEDS ATTENTION", ...flagged.map(line), "");
  const noted = items.filter((i) => sheet.items[i.id]?.state !== "issue" && sheet.items[i.id]?.note?.trim());
  if (noted.length) out.push("NOTES", ...noted.map(line), "");
  const open = items.filter((i) => (sheet.items[i.id]?.state ?? "todo") === "todo");
  if (open.length) out.push(`NOT CHECKED (${open.length})`, ...open.slice(0, 40).map((i) => `• ${i.label}`), ...(open.length > 40 ? [`…and ${open.length - 40} more`] : []), "");
  if (sheet.overall_note.trim()) out.push("OVERALL", sheet.overall_note.trim(), "");
  return out.join("\n").trim();
}
