import type { Property } from "../types";
import type { PropertyExtra } from "../listing-data/rentcast";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const num = (n: number) => n.toLocaleString("en-US");

export interface ListingPostData {
  /** price + beds/baths/size, formatted so the post renderer turns them into big-number tiles */
  stats: string[];
  /** more numbers (year built, lot, HOA, taxes, days on market) for a second tile slide */
  details: string[];
  /** words, not numbers: property type etc. — for the caption */
  descriptors: string[];
  /** short sentences from the agent's own description of the home, for the highlights image */
  notes: string[];
  fullAddress: string;
  placeLine: string;
}

/** Everything we know about a home, ready for a post. Nothing is invented: a field we don't have is simply left out. */
export function listingPostData(prop: Property, o: { extra?: PropertyExtra | null; soldPrice?: number | null } = {}): ListingPostData {
  const x = o.extra ?? null;
  const price = o.soldPrice ?? prop.list_price;
  const stats = [price ? money(price) : "", prop.beds != null ? `${prop.beds} bd` : "", prop.baths != null ? `${prop.baths} ba` : "", prop.sqft ? `${num(prop.sqft)} sq ft` : ""].filter(Boolean);
  const details = [
    x?.year_built ? `${x.year_built} built` : "",
    x?.lot_sqft && x.lot_sqft >= 500 ? `${num(x.lot_sqft)} sq ft lot` : "",
    x?.hoa_fee ? `${money(x.hoa_fee)} HOA/mo` : "",
    x?.tax_amount ? `${money(x.tax_amount)} taxes/yr` : "",
    x?.list_status === "Active" && x.days_on_market != null && x.days_on_market >= 0 ? `${x.days_on_market} days on market` : "",
  ].filter(Boolean);
  const descriptors = [x?.property_type ?? "", x?.garage_spaces ? `${x.garage_spaces}-car garage` : "", x?.pool ? "Pool" : ""].filter(Boolean);
  const cityState = [prop.city, [prop.state, prop.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const notes = (prop.description ?? "").split(/(?<=[.!?])\s+|\n+|;\s*/).map((t) => t.replace(/^[-•*\s]+/, "").trim()).filter((t) => t.length >= 18 && t.length <= 110).slice(0, 3);
  return { stats, details, descriptors, notes, fullAddress: [prop.address, cityState].filter(Boolean).join(", "), placeLine: cityState };
}

/** The data block of a listing caption. */
export function captionDataLines(d: ListingPostData): string[] {
  const price = d.stats.find((s) => s.startsWith("$"));
  const specs = d.stats.filter((s) => !s.startsWith("$"));
  return [
    d.fullAddress ? `📍 ${d.fullAddress}` : "",
    price ? `💰 ${price}` : "",
    specs.length ? `🛏 ${specs.join(" • ")}` : "",
    d.details.length || d.descriptors.length ? `✨ ${[...d.descriptors, ...d.details].join(" • ")}` : "",
  ].filter(Boolean);
}
