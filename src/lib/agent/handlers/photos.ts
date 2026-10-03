import type { Property } from "../../types";
import type { Ctx } from "../context";
import { persistState } from "../conversation";
import { parseAddress } from "../nlu";
import { TOOLS } from "../tools";
import { PORTALS, pullListingPhotos, type PullResult } from "../../images/listing";
import { type HandlerOut, reply } from "./types";
import { locationGate } from "./location";
import { enrichProperty } from "../property-lookup";

export const firstUrl = (text: string) => /https?:\/\/[^\s)<>"']+/i.exec(text)?.[0].replace(/[.,;!?]+$/, "") ?? null;

export function explainPull(r: PullResult, address: string): string {
  if (r.added) return `Pulled ${r.added} ${r.added === 1 ? "photo" : "photos"} from ${r.host} for ${address}.`;
  const portal = PORTALS.test(r.host);
  if (r.reason === "robots" || r.reason === "blocked") {
    return portal
      ? `${r.host} doesn't allow automated photo access, so I can't pull from it. If you send me the listing link from your brokerage or MLS site, I can try that.`
      : `${r.host} doesn't allow automatic access to its photos.`;
  }
  if (r.reason === "none") return `I found the page but it doesn't share photos I can use.`;
  if (r.reason === "bad_link") return r.detail ?? "That link didn't work.";
  return r.detail ?? "I couldn't read that page.";
}

/** Best-effort photo pull while building a workflow. Never throws; bounded by safeFetch timeouts. */
export async function autoPhotos(ctx: Ctx, prop: Property, url?: string | null): Promise<PullResult | null> {
  const link = url ?? prop.listing_url;
  if (!link) return null;
  ctx.steps.push("Finding property photos");
  return pullListingPhotos(ctx.store, ctx.userId, prop, link);
}

/** The agent pasted a listing link: attach it to the right property and pull photos. */
export async function listingLinkHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const url = firstUrl(text)!;
  const addr = parseAddress(text);
  let prop: Property | null = null;
  if (addr) {
    const gate = await locationGate(ctx, "listing_link", text, addr);
    if (!gate.ok) return gate.out;
    const pl = gate.found.place;
    prop = ((await TOOLS.create_property.run(ctx, { address: addr, city: pl.city, state: pl.state, zip: pl.zip, county: pl.county })) as any).data.property;
    prop = (await enrichProperty(ctx, prop!, { place: pl })).property;
  }
  else if (ctx.state.last_property_id) prop = await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id);
  if (!prop) {
    ctx.state.pending = { kind: "clarify", intent: "listing_link", slots: { text }, missing: "address" };
    await persistState(ctx);
    return reply("Which property is that listing for?");
  }
  ctx.state.last_property_id = prop.id;
  await persistState(ctx);
  ctx.steps.push("Finding property photos");
  const r = await pullListingPhotos(ctx.store, ctx.userId, prop, url);
  const msg = explainPull(r, prop.address);
  if (r.added) return reply(msg, [{ type: "notice", tone: "success", title: msg, body: r.filledCity ? "I also filled in the city from the listing." : "They'll show up on the property card and in your social posts. Only use photos you have the right to share.", buttons: [{ label: "View property", style: "primary", href: `/properties/${prop.id}` }] }]);
  return reply(msg, [{ type: "notice", tone: "warn", title: "I couldn't pull photos from that link", body: msg, buttons: [{ label: "Add your own photos", style: "quiet", href: `/properties/${prop.id}` }] }]);
}
