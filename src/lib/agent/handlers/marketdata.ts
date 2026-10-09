import type { Block, ListingCardData, Property } from "../../types";
import type { Ctx } from "../context";
import { fullMoney } from "../context";
import { creditCost, ensureCredits } from "../../credits";
import { contactFacts } from "../memory";
import { mentionedContacts } from "./contacts";
import { hit } from "../../server/rate-limit";
import { peekMedia } from "../../media/service";
import { tierLimits, tierOf } from "../../media/limits";
import { trackApi, usageFor } from "../../media/usage";
import { type ListingCard, type PropertyExtra, newListings, rentalListings, rentcastConfigured, RentcastError } from "../../listing-data/rentcast";
import { extractPlace, enrichProperty, type LookupMemory } from "../property-lookup";
import { locationGate } from "./location";
import { parseAddress, parseBeds, parseMoney } from "../nlu";
import { TOOLS } from "../tools";
import { askBack } from "./ask";
import { type HandlerOut, reply } from "./types";

/** Same-origin image for a home: Street View of the address (needs the Google Maps key + a city/state). The card shows a placeholder if it 404s. */
export const streetViewUrl = (a: { address: string; city?: string | null | undefined; state?: string | null | undefined; zip?: string | null | undefined }) =>
  a.city && a.state ? `/api/places/streetview?q=${encodeURIComponent([a.address, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "))}` : null;

const plus = (n: number) => `${n.toLocaleString("en-US")}`;
const ageLabel = (d: number | null) => (d == null ? undefined : d <= 0 ? "New today" : d === 1 ? "New · 1 day" : `New · ${d} days`);

function prepNotes(p: Property, x?: PropertyExtra): string[] {
  const out: string[] = [];
  if (!x) return out;
  if (p.list_price && x.est_value) {
    const gap = (p.list_price - x.est_value) / x.est_value;
    if (Math.abs(gap) >= 0.05) out.push(`Listed ${Math.abs(Math.round(gap * 100))}% ${gap > 0 ? "above" : "below"} the ${fullMoney(x.est_value)} automated estimate — be ready to explain the pricing either way.`);
  }
  if (x.days_on_market != null && x.days_on_market >= 30) out.push(`${x.days_on_market} days on market — expect questions about price, and ask what feedback it has had.`);
  if (x.year_built && x.year_built < 1980) out.push(`Built in ${x.year_built} — worth asking about the roof, electrical, plumbing and (pre-1978) lead paint disclosures.`);
  if (x.last_sale_date && x.last_sale_price) { const mo = Math.round((Date.now() - new Date(x.last_sale_date).getTime()) / (30 * 86_400_000)); if (mo >= 0 && mo < 18) out.push(`Sold ${mo <= 1 ? "recently" : `${mo} months ago`} for ${fullMoney(x.last_sale_price)} — a quick resale, so check for renovation work and permits.`); }
  if (x.hoa_fee) out.push(`HOA fee about ${fullMoney(x.hoa_fee)}/mo — get the dues, special assessments and rental rules.`);
  return out.slice(0, 3);
}

/** "Prep for 1231 Main Street": create the property, pull everything we can, and answer with a card + the numbers + what to watch for. */
export async function prepPropertyHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const street = parseAddress(text);
  let prop: Property | null = null;
  if (street) {
    const gate = await locationGate(ctx, "prep_property", text, street);
    if (!gate.ok) return gate.out;
    const place = gate.found.place;
    prop = ((await TOOLS.create_property.run(ctx, { address: street, city: place.city, state: place.state, zip: place.zip, county: place.county })) as any).data.property as Property;
  } else if (ctx.state.last_property_id) prop = await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id);
  if (!prop) return askBack(ctx, "prep_property", text, "address", "Which address should I prep? (Street number and name — I'll find the rest.)");
  ctx.state.last_property_id = prop.id;
  ctx.steps.push("Pulling property data");
  const prior = (await ctx.store.list("memories", ctx.userId)).find((m) => m.key === `cache:property_lookup:${prop!.id}`);
  // a quick lookup earlier (or a web-search one) doesn't have the listing + estimate: upgrade it once
  const prev = prior ? (JSON.parse(prior.value) as LookupMemory) : null;
  const enr = await enrichProperty(ctx, prop, { full: true, force: Boolean(rentcastConfigured() && prev && !prev.full) });
  prop = enr.property;
  const mem = enr.memory, x = mem?.extra;
  const card: ListingCardData = {
    id: prop.id, propertyId: prop.id, address: prop.address, city: prop.city, state: prop.state, zip: prop.zip, price: prop.list_price ?? x?.est_value ?? null, beds: prop.beds, baths: prop.baths, sqft: prop.sqft,
    type: x?.property_type ?? null, days_on_market: x?.days_on_market ?? null, listed_date: x?.listed_date ?? null, mls: x?.mls ?? null, image: streetViewUrl(prop),
    badge: x?.list_status === "Active" ? `Active${x.days_on_market != null ? ` · ${x.days_on_market}d` : ""}` : !prop.list_price && x?.est_value ? "Est. value" : undefined,
  };
  const cachedPrep = await peekMedia({ address: prop.address, city: prop.city, state: prop.state, zip: prop.zip, propertyId: prop.id }).catch(() => null);
  if (cachedPrep?.photos[0]) { card.photo = cachedPrep.photos[0].thumbUrl ?? cachedPrep.photos[0].url; card.photoStatus = "ok"; }
  const lines: string[] = [];
  const specs = [prop.beds != null && `${prop.beds} bd`, prop.baths != null && `${prop.baths} ba`, prop.sqft && `${plus(prop.sqft)} sq ft`, x?.year_built && `built ${x.year_built}`, x?.lot_sqft && `${plus(x.lot_sqft)} sq ft lot`, x?.property_type].filter(Boolean);
  if (specs.length) lines.push(specs.join(" · "));
  if (x?.list_status === "Active" && prop.list_price) lines.push(`Active listing at ${fullMoney(prop.list_price)}${x.days_on_market != null ? `, ${x.days_on_market} days on market` : ""}${x.mls ? ` (${x.mls})` : ""}${x.listing_agent ? ` — ${x.listing_agent}${x.listing_office ? `, ${x.listing_office}` : ""}` : ""}.`);
  if (x?.est_value) lines.push(`Estimated value ${fullMoney(x.est_value)}${x.est_low && x.est_high ? ` (range ${fullMoney(x.est_low)}–${fullMoney(x.est_high)})` : ""} — an automated estimate, not an appraisal.`);
  if (x?.last_sale_price) lines.push(`Last sold ${fullMoney(x.last_sale_price)}${x.last_sale_date ? ` on ${new Date(x.last_sale_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}.`);
  if (x?.tax_amount) lines.push(`Property taxes about ${fullMoney(x.tax_amount)}${x.tax_year ? ` (${x.tax_year})` : ""}.`);
  const notes = prepNotes(prop, x);
  const found = Boolean(mem?.found);
  const head = found ? `Here's what I pulled on ${prop.address}${prop.city ? `, ${prop.city}` : ""}:` : `I saved ${prop.address}, but I couldn't find its details${rentcastConfigured() ? " in the property data" : ""}. Tell me the beds, baths and price and I'll fill it in.`;
  const body = [head, ...lines, ...(notes.length ? ["", "Worth knowing:", ...notes.map((n) => `• ${n}`)] : []), ...(found ? ["", "Double-check anything before you quote it to a client."] : [])].join("\n");
  const blocks: Block[] = [{ type: "listings", title: prop.address, subtitle: found ? undefined : "Details not found", cards: [card] }, {
    type: "choice", title: "Next",
    buttons: [
      { label: "Make a post", style: "primary", action: { type: "prompt", text: `Create an Instagram post for ${prop.address}` } },
      { label: "Set up an open house", style: "secondary", action: { type: "prompt", text: `Set up an open house at ${prop.address}` } },
      { label: "Open property", style: "quiet", href: `/properties/${prop.id}` },
    ],
  }];
  return reply(body, blocks, "smalltalk"); // the lookup itself is billed when it runs (cached repeats are free)
}

const DAYS: [RegExp, number][] = [[/\b(today|last 24|past 24|past day|overnight)\b/i, 1], [/\b(last|past) (2|two|few) days|48 hours\b/i, 3], [/\b(this|last|past) week\b|\b7 days\b/i, 7], [/\b(last|past|this) (2|two) weeks\b|\b14 days\b/i, 14], [/\b(last|past|this) month\b|\b30 days\b/i, 30]];

/** "What listings are new in my area?": 5–7 of the newest active listings as cards. */
export async function newListingsHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  if (!rentcastConfigured()) return reply("New-listing search isn't available right now. Check back soon and I'll show the newest listings as cards. In the meantime I can pull details on any single address — just say “prep for 123 Main Street”.", [{ type: "notice", tone: "info", title: "Listing search unavailable", body: "This isn't available right now. Try again a little later." }], "smalltalk");
  const here = extractPlace(text);
  // the agent's city (profile location) beats a "Montgomery County" style market, because the listing search needs a real city or ZIP
  const real = (p: ReturnType<typeof extractPlace>) => (p.city && !/\bcounty\b/i.test(p.city) ? p : { ...p, city: undefined });
  const a1 = real(extractPlace(ctx.profile.location ?? "")), a2 = real(extractPlace(ctx.profile.primary_market ?? ""));
  const home = a1.city || a1.zip ? a1 : a2;
  const city = here.city ?? home.city, state = here.state ?? home.state, zip = here.zip ?? (here.city ? undefined : home.zip);
  const loc = [city, state].filter(Boolean).join(", ");
  if (!(city && state) && !zip) return askBack(ctx, "new_listings", text, "location", "Which city or ZIP should I look in? (I'll remember it as your market.)");
  if (!hit(`newlist:${ctx.userId}`, 20, 3_600_000)) return reply("I've pulled a lot of listing searches this hour — give it a few minutes and ask again.", [], "smalltalk");
  const days = DAYS.find(([re]) => re.test(text))?.[1] ?? 7;
  const money = parseMoney(text);
  const beds = parseBeds(text) ?? undefined;
  const type = /\bcondos?\b/i.test(text) ? "Condo" : /\btown ?(?:home|house)s?\b/i.test(text) ? "Townhouse" : /\b(single.family|houses?)\b/i.test(text) ? "Single Family" : undefined;
  ctx.steps.push("Checking new listings");
  if ((await usageFor(ctx.userId)).listingApiRequests >= tierLimits(await tierOf(ctx.userId)).listingSearches) return reply("You've used this month's listing searches on your plan. They reset on the 1st, or you can upgrade for more.", [], "smalltalk");
  let cards: ListingCard[];
  try { cards = await newListings({ city: city ?? undefined, state: state ?? undefined, zip: zip ?? undefined, beds, minPrice: money.min ?? undefined, maxPrice: money.max ?? undefined, propertyType: type, days, limit: 7 }); }
  catch (e) {
    const code = e instanceof RentcastError ? e.code : "network";
    return reply(code === "limit" ? "I've hit the listing-data limit for now. Try again a little later." : code === "auth" ? "Listing search isn't working right now. Try again a little later." : "I couldn't reach the listing data just now. Try again in a minute.", [], "smalltalk");
  }
  await trackApi({ userId: ctx.userId, provider: "rentcast", endpoint: "listings/sale", success: true, units: 1, estCostUsd: Number(process.env.MILA_RENTCAST_COST_PER_REQUEST) || 0.074 });
  const where = loc || zip || "your area";
  if (!cards.length) return reply(`I don't see any new listings in ${where} in the last ${days === 1 ? "day" : `${days} days`}${beds ? ` with ${beds}+ beds` : ""}${money.max ? ` under ${fullMoney(money.max)}` : ""}. Want me to widen the search?`, [{ type: "choice", title: "Widen it", buttons: [{ label: "Last 30 days", style: "primary", action: { type: "prompt", text: `New listings in ${where} in the last 30 days` } }, ...(beds || money.max ? [{ label: "Drop my filters", style: "secondary" as const, action: { type: "prompt", text: `New listings in ${where}` } }] : [])] }], "new_listings");
  const out: ListingCardData[] = cards.map((c) => ({ id: c.id, address: c.address, city: c.city, state: c.state, zip: c.zip, price: c.price, beds: c.beds, baths: c.baths, sqft: c.sqft, type: c.type, days_on_market: c.days_on_market, listed_date: c.listed_date, mls: c.mls, image: streetViewUrl(c), badge: ageLabel(c.days_on_market), lines: c.office ? [c.office] : undefined }));
  await Promise.all(out.map(async (c) => { const m = await peekMedia({ address: c.address, city: c.city, state: c.state, zip: c.zip, listingId: c.id }).catch(() => null); if (m?.photos[0]) { c.photo = m.photos[0].thumbUrl ?? m.photos[0].url; c.photoStatus = "ok"; } }));
  const filt = [beds && `${beds}+ bd`, type, money.max && `under ${fullMoney(money.max)}`, money.min && `over ${fullMoney(money.min)}`].filter(Boolean).join(" · ");
  return reply(`Here ${cards.length === 1 ? "is the newest listing" : `are the ${cards.length} newest listings`} in ${where} from the last ${days === 1 ? "day" : `${days} days`}${filt ? ` (${filt})` : ""}. Tap one to prep it, or save it to your properties.`, [{ type: "listings", title: `New in ${where}`, subtitle: filt || undefined, cards: out }, { type: "choice", title: "Refine", buttons: [{ label: "Last 30 days", style: "secondary", action: { type: "prompt", text: `New listings in ${where} in the last 30 days` } }, { label: "Under my buyers' budgets", style: "secondary", action: { type: "prompt", text: `New listings in ${where} under ${money.max ? fullMoney(money.max) : "$750k"}` } }] }], "new_listings");
}

/** The "Save" button on a listing card. The card comes from the browser, so every field is validated and bounded. */
export async function saveListingCard(ctx: Ctx, raw: Record<string, unknown>): Promise<HandlerOut> {
  const str = (v: unknown, max = 120) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
  const address = str(raw.address, 100);
  if (!address || !/\d/.test(address)) return reply("I couldn't read that listing's address.", [], "smalltalk");
  const made = (await TOOLS.create_property.run(ctx, { address, city: str(raw.city, 60) || undefined, state: str(raw.state, 2).toUpperCase() || undefined, zip: str(raw.zip, 10) || undefined, list_price: num(raw.price, 1, 500_000_000), beds: num(raw.beds, 0, 50), baths: num(raw.baths, 0, 50), sqft: num(raw.sqft, 1, 200_000) })) as any;
  if (!made.ok) return reply("I couldn't save that one.", [], "smalltalk");
  const p = made.data.property as Property;
  ctx.state.last_property_id = p.id;
  return reply(`Saved ${p.address}${p.city ? `, ${p.city}` : ""} to your properties.`, [{ type: "choice", title: "Next", buttons: [{ label: "Prep it", style: "primary", action: { type: "prompt", text: `Prep for ${p.address}` } }, { label: "Open property", style: "secondary", href: `/properties/${p.id}` }] }], "smalltalk");
}


// ------------------------------------------------------------------ rentals for a client
/** "Find rentals under $2,000 in Austin for a client": up to 5 rental cards to swipe through, then ask who they are for. Returns null when this isn't a rental search or listing data isn't connected. */
export async function rentalCardsHandler(ctx: Ctx, text: string): Promise<HandlerOut | null> {
  if (!rentcastConfigured()) return null;
  if (!/\b(rentals?|for rent|to rent|apartments?|lease|renting)\b/i.test(text)) return null;
  if (text.split(/\s+/).length > 28) return null; // a long brief with many requirements gets the deeper research instead
  const here = extractPlace(text);
  const real = (p: ReturnType<typeof extractPlace>) => (p.city && !/\bcounty\b/i.test(p.city) ? p : { ...p, city: undefined });
  const a1 = real(extractPlace(ctx.profile.location ?? "")), a2 = real(extractPlace(ctx.profile.primary_market ?? ""));
  const home = a1.city || a1.zip ? a1 : a2;
  const city = here.city ?? home.city, state = here.state ?? home.state, zip = here.zip ?? (here.city ? undefined : home.zip);
  if (!(city && state) && !zip) return null; // no place to search yet: the deeper research reads the whole brief
  if (!hit(`rentals:${ctx.userId}`, 20, 3_600_000)) return reply("I've pulled a lot of rental searches this hour. Give it a few minutes and ask again.", [], "smalltalk");
  const money = parseMoney(text), beds = parseBeds(text) ?? undefined;
  ctx.steps.push("Finding rentals");
  if ((await usageFor(ctx.userId)).listingApiRequests >= tierLimits(await tierOf(ctx.userId)).listingSearches) return reply("You've used this month's listing searches on your plan. They reset on the 1st, or you can upgrade for more.", [], "smalltalk");
  await ensureCredits(ctx.userId, await creditCost("property_lookup"));
  let cards;
  try { cards = await rentalListings({ city: city ?? undefined, state: state ?? undefined, zip: zip ?? undefined, beds, minRent: money.min ?? undefined, maxRent: money.max ?? undefined, limit: 5 }); }
  catch { return reply("I couldn't reach the rental listings just now. Try again in a minute.", [], "smalltalk"); }
  await trackApi({ userId: ctx.userId, provider: "rentcast", endpoint: "listings/rental", success: true, units: 1, estCostUsd: Number(process.env.MILA_RENTCAST_COST_PER_REQUEST) || 0.074 });
  const where = [city, state].filter(Boolean).join(", ") || zip || "your area";
  if (!cards.length) return reply(`I don't see rentals in ${where}${money.max ? ` under ${fullMoney(money.max)}` : ""} right now. Want me to widen it?`, [], "smalltalk");
  // a client named in the message whose notes mention a pet: show each place's pet policy up front
  const known = await mentionedContacts(ctx, text);
  const client = known[0] ?? null;
  const petty = client ? (await contactFacts(ctx, client)).some((f) => /\b(dog|cat|pet)s?\b/i.test(f)) : /\b(dog|cat|pet)s?\b/i.test(text);
  const out: ListingCardData[] = cards.map((c) => ({
    id: c.id, address: c.unit ? `${c.address} ${c.unit}` : c.address, city: c.city, state: c.state, zip: c.zip, price: c.rent, beds: c.beds, baths: c.baths, sqft: c.sqft, type: c.type, days_on_market: c.days_on_market, listed_date: c.listed_date, mls: null,
    image: streetViewUrl({ address: c.address, city: c.city, state: c.state, zip: c.zip }), rental: true, badge: c.days_on_market != null && c.days_on_market <= 3 ? "New" : undefined,
    lines: [petty ? (c.pets ? `Pets: ${c.pets}` : "Pets: ask the building") : [c.hoa ? `HOA ${fullMoney(c.hoa)}` : null, c.pets ? `Pets: ${c.pets}` : null].filter(Boolean).join(" · ")].filter(Boolean) as string[],
  }));
  await Promise.all(out.map(async (c, i) => { const m = await peekMedia({ address: cards[i].address, city: c.city, state: c.state, zip: c.zip, listingId: c.id }).catch(() => null); if (m?.photos[0]) { c.photo = m.photos[0].thumbUrl ?? m.photos[0].url; c.photoStatus = "ok"; } }));
  const filt = [beds && `${beds}+ bd`, money.max && `under ${fullMoney(money.max)}/mo`].filter(Boolean).join(" · ");
  const blocks: Block[] = [{ type: "listings", title: `Rentals in ${where}`, subtitle: filt || undefined, cards: out }];
  const pool = (await ctx.store.list("contacts", ctx.userId)).filter((c) => ["buyer", "renter", "lead"].includes(c.type) && c.status !== "closed").sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const picks = client ? [client] : pool.slice(0, 3);
  blocks.push({ type: "choice", title: client ? `Save these for ${client.name.split(/\s+/)[0]}?` : "Who are these for?", buttons: [
    ...picks.map((c, i) => ({ label: client ? `Save all ${out.length} for ${c.name.split(/\s+/)[0]}` : c.name, style: (i === 0 ? "primary" : "secondary") as "primary" | "secondary", action: { type: "save_rentals_for", contactId: c.id, cards: out.map((x) => ({ address: x.address, city: x.city, state: x.state, zip: x.zip, price: x.price, beds: x.beds, baths: x.baths, sqft: x.sqft, note: x.lines?.[0] ?? null })) } })),
    { label: "A new client", style: "secondary" as const, action: { type: "prompt", text: "I have a new client who is looking for a rental. Their name is " } },
  ] });
  return reply(`Here ${out.length === 1 ? "is a rental" : `are ${out.length} rentals`} in ${where}${filt ? ` (${filt})` : ""}. Swipe through them${client ? "" : ", then tell me who they're for and I'll save them to that client's profile"}.`, blocks, "market_research");
}

const rentalLine = (c: { address: string; city?: unknown; state?: unknown; price?: unknown; beds?: unknown; baths?: unknown; note?: unknown }) => {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return [String(c.address).slice(0, 80), [c.city, c.state].filter((x) => typeof x === "string" && x).join(", "), num(c.price) ? `${fullMoney(num(c.price)!)}/mo` : null, num(c.beds) != null ? `${num(c.beds)} bd` : null, num(c.baths) != null ? `${num(c.baths)} ba` : null, typeof c.note === "string" && c.note ? c.note.slice(0, 60) : null].filter(Boolean).join(" · ");
};

/** Saves rentals to a CLIENT's profile (never to Properties, which is only for homes the agent has work to do at). */
export async function saveRentalsForClient(ctx: Ctx, contactId: string, rawCards: unknown): Promise<HandlerOut> {
  const c = await ctx.store.get("contacts", ctx.userId, contactId);
  if (!c) return reply("I couldn't find that client.", [], "smalltalk");
  const cards = (Array.isArray(rawCards) ? rawCards : []).slice(0, 8).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { address?: unknown }).address === "string") as unknown as Parameters<typeof rentalLine>[0][];
  if (!cards.length) return reply("There was nothing to save.", [], "smalltalk");
  const { saveMemory } = await import("../memory");
  for (const card of cards) await saveMemory(ctx, { scope: "contact", subject_id: c.id, key: `Saved rental: ${String(card.address).slice(0, 60)}`, value: rentalLine(card), source: "system" });
  ctx.state.last_contact_ids = [c.id];
  return reply(`Saved ${cards.length === 1 ? "that rental" : `all ${cards.length} rentals`} to ${c.name.split(/\s+/)[0]}'s profile. They live there, not in your Properties tab.`, [{ type: "choice", title: "Next", buttons: [
    { label: "Open profile", style: "primary", href: `/contacts/${c.id}` },
    { label: `Draft an email to ${c.name.split(/\s+/)[0]}`, style: "secondary", action: { type: "prompt", text: `Email ${c.name} the rentals we found` } },
  ] }], "smalltalk");
}

/** The "Save for a client" button on one rental card: ask whose profile it goes in. */
export async function saveRentalCard(ctx: Ctx, card: unknown): Promise<HandlerOut> {
  const pool = (await ctx.store.list("contacts", ctx.userId)).filter((c) => ["buyer", "renter", "lead"].includes(c.type) && c.status !== "closed").sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4);
  if (!pool.length) return reply("Who is this for? Tell me their name and I'll add them as a client first.", [], "smalltalk");
  return reply("Whose profile should I save it to?", [{ type: "choice", title: "Pick a client", buttons: pool.map((c, i) => ({ label: c.name, style: (i === 0 ? "primary" : "secondary") as "primary" | "secondary", action: { type: "save_rentals_for", contactId: c.id, cards: [card] } })) }], "smalltalk");
}
