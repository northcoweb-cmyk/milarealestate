import type { Block, ListingCardData, Property } from "../../types";
import type { Ctx } from "../context";
import { fullMoney } from "../context";
import { hit } from "../../server/rate-limit";
import { type ListingCard, type PropertyExtra, newListings, rentcastConfigured, RentcastError } from "../../listing-data/rentcast";
import { extractPlace, enrichProperty, resolveAddress, type LookupMemory } from "../property-lookup";
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
    const r = await resolveAddress(ctx, text, street);
    if (r.status === "ask") return askBack(ctx, "prep_property", text, "location", `What city and state is ${street} in? A ZIP works too.`);
    const place = r.place;
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
  const lines: string[] = [];
  const specs = [prop.beds != null && `${prop.beds} bd`, prop.baths != null && `${prop.baths} ba`, prop.sqft && `${plus(prop.sqft)} sq ft`, x?.year_built && `built ${x.year_built}`, x?.lot_sqft && `${plus(x.lot_sqft)} sq ft lot`, x?.property_type].filter(Boolean);
  if (specs.length) lines.push(specs.join(" · "));
  if (x?.list_status === "Active" && prop.list_price) lines.push(`Active listing at ${fullMoney(prop.list_price)}${x.days_on_market != null ? `, ${x.days_on_market} days on market` : ""}${x.mls ? ` (${x.mls})` : ""}${x.listing_agent ? ` — ${x.listing_agent}${x.listing_office ? `, ${x.listing_office}` : ""}` : ""}.`);
  if (x?.est_value) lines.push(`Estimated value ${fullMoney(x.est_value)}${x.est_low && x.est_high ? ` (range ${fullMoney(x.est_low)}–${fullMoney(x.est_high)})` : ""} — an automated estimate, not an appraisal.`);
  if (x?.last_sale_price) lines.push(`Last sold ${fullMoney(x.last_sale_price)}${x.last_sale_date ? ` on ${new Date(x.last_sale_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}.`);
  if (x?.tax_amount) lines.push(`Property taxes about ${fullMoney(x.tax_amount)}${x.tax_year ? ` (${x.tax_year})` : ""}.`);
  const notes = prepNotes(prop, x);
  const found = Boolean(mem?.found);
  const head = found ? `Here's what I pulled on ${prop.address}${prop.city ? `, ${prop.city}` : ""}:` : `I saved ${prop.address}, but I couldn't find its details${rentcastConfigured() ? " in the property data" : " — live property data isn't connected yet"}.`;
  const body = [head, ...lines, ...(notes.length ? ["", "Worth knowing:", ...notes.map((n) => `• ${n}`)] : []), ...(found ? ["", `Source: ${mem!.sources.map((s) => s.title).join(", ")}. Check it before you quote it to a client.`] : [])].join("\n");
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
  if (!rentcastConfigured()) return reply("Live new-listing search isn't connected on this server yet. Once the property-data connection is on, ask me again and I'll show the newest listings as cards. In the meantime I can pull details on any single address — just say “prep for 123 Main Street”.", [{ type: "notice", tone: "info", title: "Property data not connected", body: "The owner can connect it with a RENTCAST_API_KEY (see the Health tab in the owner dashboard)." }], "smalltalk");
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
  let cards: ListingCard[];
  try { cards = await newListings({ city: city ?? undefined, state: state ?? undefined, zip: zip ?? undefined, beds, minPrice: money.min ?? undefined, maxPrice: money.max ?? undefined, propertyType: type, days, limit: 7 }); }
  catch (e) {
    const code = e instanceof RentcastError ? e.code : "network";
    return reply(code === "limit" ? "I've hit the listing-data limit for now. Try again a little later." : code === "auth" ? "The listing-data connection isn't working (the key was rejected). The owner needs to check it." : "I couldn't reach the listing data just now. Try again in a minute.", [], "smalltalk");
  }
  const where = loc || zip || "your area";
  if (!cards.length) return reply(`I don't see any new listings in ${where} in the last ${days === 1 ? "day" : `${days} days`}${beds ? ` with ${beds}+ beds` : ""}${money.max ? ` under ${fullMoney(money.max)}` : ""}. Want me to widen the search?`, [{ type: "choice", title: "Widen it", buttons: [{ label: "Last 30 days", style: "primary", action: { type: "prompt", text: `New listings in ${where} in the last 30 days` } }, ...(beds || money.max ? [{ label: "Drop my filters", style: "secondary" as const, action: { type: "prompt", text: `New listings in ${where}` } }] : [])] }], "new_listings");
  const out: ListingCardData[] = cards.map((c) => ({ id: c.id, address: c.address, city: c.city, state: c.state, zip: c.zip, price: c.price, beds: c.beds, baths: c.baths, sqft: c.sqft, type: c.type, days_on_market: c.days_on_market, listed_date: c.listed_date, mls: c.mls, image: streetViewUrl(c), badge: ageLabel(c.days_on_market), lines: c.office ? [c.office] : undefined }));
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
