import { areaFacts } from "../area-data";
import { lookupAddress, marketStats, newListings, rentalListings, rentcastConfigured, rentEstimate, RentcastError } from "../listing-data/rentcast";
import { tierLimits, tierOf } from "../media/limits";
import { trackApi, usageFor } from "../media/usage";
import type { Ctx } from "./context";

/**
 * The data Mila's research assistant can pull on its own while it works. Each tool is a thin, bounded wrapper around a real data
 * source and returns compact JSON. A tool that can't run says why, so the answer can say what was not checked.
 */
export const RESEARCH_FUNCTIONS = [
  { name: "search_rentals", description: "Active long-term rental listings (apartments, condos, houses) in a US city or ZIP, cheapest first. Use for any rent search. Includes unit numbers when the listing has them.", parameters: { type: "object", properties: { city: { type: "string" }, state: { type: "string", description: "2-letter state" }, zip: { type: "string" }, beds: { type: "number", description: "exact bedrooms (0 = studio)" }, baths: { type: "number", description: "minimum bathrooms" }, max_rent: { type: "number" }, min_rent: { type: "number" }, property_type: { type: "string", enum: ["Apartment", "Condo", "Townhouse", "Single Family", "Multi-Family"] }, days: { type: "number", description: "only listings from the last N days" } } } },
  { name: "rent_estimate", description: "What a specific unit or home would rent for, with comparable rentals. Pass the full address including the unit.", parameters: { type: "object", properties: { address: { type: "string" }, beds: { type: "number" }, baths: { type: "number" }, sqft: { type: "number" }, property_type: { type: "string" } }, required: ["address"] } },
  { name: "search_for_sale", description: "Active for-sale listings in a US city or ZIP (newest first), optionally filtered.", parameters: { type: "object", properties: { city: { type: "string" }, state: { type: "string" }, zip: { type: "string" }, beds: { type: "number", description: "minimum bedrooms" }, min_price: { type: "number" }, max_price: { type: "number" }, property_type: { type: "string", enum: ["Single Family", "Condo", "Townhouse", "Multi-Family"] }, days: { type: "number" } } } },
  { name: "property_details", description: "Public record, active listing (price, days on market, agent, MLS number), value estimate and sale comps for one address, including a unit (e.g. '350 5th Ave Apt 32B, New York, NY').", parameters: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "market_stats", description: "Sale and rent statistics for a ZIP code: median price and rent, price per square foot, days on market, supply, rent by bedroom count.", parameters: { type: "object", properties: { zip: { type: "string" } }, required: ["zip"] } },
  { name: "area_facts", description: "Facts about any US address, building, neighbourhood or city: coordinates, neighbourhood name, county, FEMA flood zone, census income and rent, Walk Score when connected. Use before judging a neighbourhood.", parameters: { type: "object", properties: { place: { type: "string", description: "address, building name with city, or neighbourhood and city" } }, required: ["place"] } },
] as const;

const MAX_DATA_CALLS = 8; // per research run: bounds both the cost and the time
const costPerCall = () => Number(process.env.MILA_RENTCAST_COST_PER_REQUEST) || 0.074;
const str = (v: unknown, n = 120) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const nm = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function researchRunner(ctx: Ctx) {
  let calls = 0;
  /** one paid data request: enforce the plan's monthly allowance, then record it */
  const paid = async <T>(endpoint: string, units: number, run: () => Promise<T>): Promise<T | { error: string }> => {
    if (!rentcastConfigured()) return { error: "Live property and rental data isn't connected on this server." };
    if (++calls > MAX_DATA_CALLS) return { error: "Data request limit for this search reached. Work with what you have and say what you could not check." };
    const used = (await usageFor(ctx.userId)).listingApiRequests;
    if (used + units > tierLimits(await tierOf(ctx.userId)).listingSearches) return { error: "This account's monthly listing-data allowance is used up. Tell the agent, and rely on web search for the rest." };
    try {
      const r = await run();
      await trackApi({ userId: ctx.userId, provider: "rentcast", endpoint, success: true, units, estCostUsd: units * costPerCall() });
      return r;
    } catch (e) {
      await trackApi({ userId: ctx.userId, provider: "rentcast", endpoint, success: false, units: 0 });
      return { error: e instanceof RentcastError ? (e.code === "limit" ? "The listing-data service is at its request limit right now." : e.code === "not_found" ? "No record found." : `Listing data error: ${e.message}`) : "The listing-data service didn't respond." };
    }
  };
  return async (name: string, a: Record<string, unknown>): Promise<unknown> => {
    ctx.steps.push(({ search_rentals: "Searching rentals", rent_estimate: "Estimating rent", search_for_sale: "Searching listings", property_details: "Pulling the property record", market_stats: "Checking market statistics", area_facts: "Checking the neighbourhood" } as Record<string, string>)[name] ?? "Researching");
    switch (name) {
      case "search_rentals": {
        const r = await paid("listings/rental", 1, () => rentalListings({ city: str(a.city, 60) || undefined, state: str(a.state, 2).toUpperCase() || undefined, zip: str(a.zip, 10) || undefined, beds: nm(a.beds), baths: nm(a.baths), maxRent: nm(a.max_rent), minRent: nm(a.min_rent), propertyType: str(a.property_type, 30) || undefined, days: nm(a.days), limit: 8 }));
        if ("error" in (r as object)) return r;
        return { count: (r as unknown[]).length, rentals: (r as Awaited<ReturnType<typeof rentalListings>>).map((x) => ({ address: x.address, unit: x.unit, city: x.city, state: x.state, zip: x.zip, rent: x.rent, beds: x.beds, baths: x.baths, sqft: x.sqft, type: x.type, days_on_market: x.days_on_market, listed: x.listed_date, hoa: x.hoa, pets: x.pets, agent: x.agent, office: x.office, mls: x.mls })) };
      }
      case "rent_estimate": {
        const r = await paid("avm/rent", 1, () => rentEstimate(str(a.address, 160), { beds: nm(a.beds), baths: nm(a.baths), sqft: nm(a.sqft), propertyType: str(a.property_type, 30) || undefined }));
        return r;
      }
      case "search_for_sale": {
        const r = await paid("listings/sale", 1, () => newListings({ city: str(a.city, 60) || undefined, state: str(a.state, 2).toUpperCase() || undefined, zip: str(a.zip, 10) || undefined, beds: nm(a.beds), minPrice: nm(a.min_price), maxPrice: nm(a.max_price), propertyType: str(a.property_type, 30) || undefined, days: nm(a.days) ?? 30, limit: 8 }));
        if ("error" in (r as object)) return r;
        return { count: (r as unknown[]).length, listings: (r as Awaited<ReturnType<typeof newListings>>).map((x) => ({ address: x.address, city: x.city, state: x.state, zip: x.zip, price: x.price, beds: x.beds, baths: x.baths, sqft: x.sqft, type: x.type, days_on_market: x.days_on_market, listed: x.listed_date, agent: x.agent, office: x.office, mls: x.mls })) };
      }
      case "property_details": return paid("property/full", 3, () => lookupAddress(str(a.address, 160), {}, { full: true }));
      case "market_stats": return paid("markets", 1, () => marketStats(str(a.zip, 10)));
      case "area_facts": return areaFacts(str(a.place, 160)); // free public sources: no allowance used
      default: return { error: `Unknown tool ${name}` };
    }
  };
}
