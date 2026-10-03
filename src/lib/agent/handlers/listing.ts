import type { Block, Contact, Property } from "../../types";
import type { Ctx } from "../context";
import { persistState } from "../conversation";
import { describeStated, extractListingFacts, hasAnyFact } from "../listing";
import { addrKey, parseAddress } from "../nlu";
import { askBack } from "./ask";
import { describeFacts, enrichProperty } from "../property-lookup";
import { TOOLS } from "../tools";
import { type HandlerOut, reply } from "./types";
import { locationGate } from "./location";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * "New listing at 8814 Brookside Drive, Rockville MD. 4 bed 3 bath, $875,000. Sellers are the Hendersons."
 * One message in, listing saved. Mila only asks for what she truly can't work out (the address itself), looks up
 * whatever the agent didn't say, and then offers the next moves instead of making the agent walk through a form.
 */
export async function addListingHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const street = parseAddress(text) ?? (ctx.state.last_property_id ? null : null);
  if (!street) {
    ctx.state.pending = { kind: "clarify", intent: "add_listing", slots: { text }, missing: "address" };
    await persistState(ctx);
    return reply("Congrats on the new listing! What's the address? You can give me the price, beds, baths and sellers in the same message and I'll save it all.");
  }
  const gate = await locationGate(ctx, "add_listing", text, street);
  if (!gate.ok) return gate.out;
  const { place, unverified, assumed } = gate.found;
  const f = extractListingFacts(text);
  ctx.steps.push("Saving your listing");
  const created = (await TOOLS.create_property.run(ctx, { address: street, city: place.city, state: place.state, zip: place.zip, county: place.county, list_price: f.list_price, beds: f.beds, baths: f.baths, sqft: f.sqft })) as any;
  let prop = created.data.property as Property;
  ctx.state.last_property_id = prop.id;

  // look up anything the agent didn't say (beds/baths/size/price) — silently, never as a question
  const missing = prop.beds == null || prop.baths == null || prop.sqft == null || prop.list_price == null;
  let looked = "";
  if (missing && !unverified) {
    ctx.steps.push("Looking up the rest online");
    const enr = await enrichProperty(ctx, prop, { place });
    prop = enr.property;
    if (enr.memory?.found) looked = describeFacts(enr.memory.facts);
  }

  // sellers: save as a contact the first time they're mentioned
  let seller: Contact | null = null;
  if (f.seller) {
    const r = (await TOOLS.create_contact.run(ctx, { name: /^[A-Z][a-z]+s$/.test(f.seller) ? `The ${f.seller}` : f.seller, type: "seller", status: "active", source: "Listing", notes: `Seller of ${street}` })) as any;
    if (r.ok) seller = r.data.contact;
  }

  const where = [prop.city, prop.state].filter(Boolean).join(", ");
  const have = [prop.beds != null ? `${prop.beds} bd` : null, prop.baths != null ? `${prop.baths} ba` : null, prop.sqft ? `${prop.sqft.toLocaleString("en-US")} sq ft` : null, prop.list_price ? money(prop.list_price) : null].filter(Boolean).join(" · ");
  const lines = [`Saved your listing: ${street}${where ? `, ${where}` : ""}${prop.zip ? ` ${prop.zip}` : ""}.`];
  if (have) lines.push(have + (hasAnyFact(f) && looked ? " (you gave me some, I found the rest online — please check them)" : looked ? " — found online, please check" : ""));
  if (seller) lines.push(`Sellers: ${seller.name} (saved as a contact).`);
  const still = [prop.list_price == null ? "price" : null, prop.beds == null ? "beds" : null, prop.baths == null ? "baths" : null, prop.sqft == null ? "square feet" : null].filter(Boolean);
  if (still.length) lines.push(`Still blank: ${still.join(", ")} — tell me whenever (e.g. “it's 3 bed 2 bath, $480k”) or add them on the property page.`);
  if (assumed) lines.push(`I assumed it's in ${where} (your market) — if not, just tell me the city and state.`);
  if (unverified) lines.push("I couldn't find that address on the map, so double-check the spelling.");
  if (!f.seller && !seller) lines.push("");
  void describeStated;

  const blocks: Block[] = [{
    type: "choice", title: "What should I do next?",
    buttons: [
      { label: "Make an Instagram post", style: "primary", action: { type: "prompt", text: `Create an Instagram post for ${street}` } },
      { label: "Set up an open house", style: "secondary", action: { type: "prompt", text: `Set up an open house at ${street}` } },
      { label: "Start a showing sheet", style: "secondary", href: `/properties/${prop.id}` },
      { label: "New-listing checklist", style: "secondary", action: { type: "listing_checklist", propertyId: prop.id } },
      { label: "Open property", style: "quiet", href: `/properties/${prop.id}` },
    ],
  }];
  return reply(lines.filter((l, i, a) => l || (i && a[i - 1])).join("\n"), blocks, "chat_simple");
}

const CHECKLIST: [string, number][] = [
  ["Order professional photos", 2], ["Prep the listing description and features", 2], ["Enter in MLS and verify it", 3],
  ["Install sign and lockbox", 3], ["Send “Just listed” to your sphere", 4], ["Schedule the first open house", 5], ["Pull comps and confirm the list price", 1],
];
export async function listingChecklist(ctx: Ctx, propertyId: string): Promise<HandlerOut> {
  const prop = await ctx.store.get("properties", ctx.userId, propertyId);
  if (!prop) return reply("I couldn't find that listing.", [], "smalltalk");
  for (const [title, days] of CHECKLIST) {
    await TOOLS.create_task.run(ctx, { kind: "task", title: `${title} — ${prop.address}`, property_id: prop.id, due_at: new Date(ctx.now.getTime() + days * 86_400_000).toISOString(), internal: true });
  }
  return reply(`Added a ${CHECKLIST.length}-step new-listing checklist for ${prop.address} to your tasks, spaced over the next few days.`, [{ type: "choice", title: "Checklist ready", buttons: [{ label: "See tasks", style: "secondary", href: "/tasks" }] }], "chat_simple");
}


const STREET_NOISE = new Set(["street", "st", "avenue", "ave", "road", "rd", "drive", "dr", "lane", "ln", "court", "ct", "way", "boulevard", "blvd", "place", "pl", "terrace", "circle", "cir", "trail", "parkway", "highway", "square", "n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west"]);
const baseAddress = (a: string) => addrKey(a.replace(/\s*#.*$/, ""));
/**
 * Which saved property is the agent talking about? By full address ("12 Oak St"), by street name ("the Oak St listing"),
 * or, when `fallbackToLast` is set, "this listing"/"it" meaning the one we were just working on.
 */
export async function resolveProperty(ctx: Ctx, text: string, fallbackToLast = false): Promise<Property | null> {
  const props = await ctx.store.list("properties", ctx.userId);
  const addr = parseAddress(text);
  if (addr) {
    const exact = props.find((p) => addrKey(p.address) === addrKey(addr)) ?? props.find((p) => baseAddress(p.address) === baseAddress(addr));
    if (exact) return exact;
  }
  const words = new Set(text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/));
  const byName = props.filter((p) => {
    const name = p.address.toLowerCase().replace(/#.*$/, "").split(/\s+/).slice(1).filter((w) => !STREET_NOISE.has(w.replace(/\./g, "")));
    return name.length > 0 && name.every((w) => w.length >= 3 && words.has(w));
  });
  if (!addr && byName.length === 1) return byName[0];
  if (!addr && fallbackToLast && ctx.state.last_property_id) return props.find((p) => p.id === ctx.state.last_property_id) ?? null;
  return null;
}

/** "Start a showing sheet for 12 Oak St" — the sheet lives on the property page; one tap gets there. */
export async function showingSheetHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = await resolveProperty(ctx, text, /\b(this|that|the|it|my|new|latest|last)\b/i.test(text) && !parseAddress(text));
  if (prop) {
    ctx.state.last_property_id = prop.id;
    await persistState(ctx);
    return reply(`Your showing sheet for ${prop.address} is ready. Open it and tap through the walkthrough as you tour; notes and photos save to the property.`, [{ type: "choice", title: "Showing sheet", buttons: [{ label: "Open showing sheet", style: "primary", href: `/properties/${prop.id}` }] }], "chat_simple");
  }
  const addr = parseAddress(text);
  if (addr) return reply(`I don't have ${addr} saved yet. Tell me to add it as a listing (with the city and state) and I'll start the sheet from there.`, [], "smalltalk");
  return askBack(ctx, "showing_sheet", text, "address", "Which property is the showing sheet for? Give me the address.");
}


/** "Price drop on 12 Oak St, now $425k" / "12 Oak St actually has 4 bedrooms": the agent's word is the truth, so apply it and say exactly what changed. */
export async function updateListingHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = await resolveProperty(ctx, text, !parseAddress(text) && /\b(this|that|the|my|latest|last|new)\b.*\b(listing|house|home|property)\b|\bit\b/i.test(text));
  const addr = parseAddress(text);
  if (!prop) {
    if (addr) return reply(`I don't have ${addr} saved yet. Want me to add it as a new listing? Just say “new listing at ${addr}” with the city and price.`, [], "smalltalk");
    return askBack(ctx, "update_listing", text, "address", "Which listing is that for? Give me the address.");
  }
  const f = extractListingFacts(text);
  // "reduced to 399", "change the price to 435,000", "now asking 1.2M": a price after to/now/at/for, with thousands implied for a bare 3 digits
  if (f.list_price == null) {
    const m = /\b(?:to|now|at|for|is)\s+\$?(\d[\d,]*(?:\.\d+)?)\s*(k|m|mm)?\b(?!\s*(?:sq|sf|square|bed|bd|br|bath|ba\b))/i.exec(text.replace(addr ? new RegExp(addr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"), "i") : /\u0000/, " "));
    if (m) { let v = parseFloat(m[1].replace(/,/g, "")); const u = (m[2] ?? "").toLowerCase(); if (u === "k") v *= 1000; else if (u === "m" || u === "mm") v *= 1_000_000; else if (v >= 100 && v < 1000 && !m[1].includes(",")) v *= 1000; if (v >= 20_000 && v <= 200_000_000) f.list_price = Math.round(v); }
  }
  const changes: { key: "list_price" | "beds" | "baths" | "sqft"; label: string; from: unknown; to: number }[] = [];
  if (f.list_price != null && f.list_price !== prop.list_price) changes.push({ key: "list_price", label: "price", from: prop.list_price, to: f.list_price });
  if (f.beds != null && f.beds !== prop.beds) changes.push({ key: "beds", label: "beds", from: prop.beds, to: f.beds });
  if (f.baths != null && f.baths !== prop.baths) changes.push({ key: "baths", label: "baths", from: prop.baths, to: f.baths });
  if (f.sqft != null && f.sqft !== prop.sqft) changes.push({ key: "sqft", label: "square feet", from: prop.sqft, to: f.sqft });
  ctx.state.last_property_id = prop.id;
  if (!changes.length) {
    if (hasAnyFact(f)) return reply(`${prop.address} already has those details, so nothing changed.`, [], "smalltalk");
    return askBack(ctx, "update_listing", text, "details", `What should I change on ${prop.address}? For example “price is now $425k”.`);
  }
  const patch: Record<string, unknown> = { verified: true }, undo: Record<string, unknown> = { verified: prop.verified };
  for (const c of changes) { patch[c.key] = c.to; undo[c.key] = c.from; }
  await ctx.store.update("properties", ctx.userId, prop.id, patch as never);
  ctx.state.last_action = { type: "property", property_id: prop.id, patch: undo };
  const fmt = (c: (typeof changes)[number], v: unknown) => (v == null ? "blank" : c.key === "list_price" ? money(Number(v)) : c.key === "sqft" ? `${Number(v).toLocaleString("en-US")}` : String(v));
  const lines = changes.map((c) => `${c.label[0].toUpperCase() + c.label.slice(1)}: ${fmt(c, c.from)} → ${fmt(c, c.to)}`);
  const priceDrop = changes.find((c) => c.key === "list_price" && typeof c.from === "number" && c.to < (c.from as number));
  return reply(`Updated ${prop.address}.\n${lines.join("\n")}`, priceDrop ? [{ type: "choice", title: "Spread the word?", buttons: [{ label: "Make a price-improvement post", style: "primary", action: { type: "prompt", text: `Create a price improvement post for ${prop.address}` } }, { label: "Open property", style: "quiet", href: `/properties/${prop.id}` }] }] : [], "chat_simple");
}
