import type { Block } from "../../types";
import type { Ctx } from "../context";
import { parseAddress } from "../nlu";
import { type HandlerOut, reply } from "./types";

export const firstUrl = (text: string) => /https?:\/\/[^\s)<>"']+/i.exec(text)?.[0].replace(/[.,;!?]+$/, "") ?? null;

/** Mila does not read listing links: no site, MLS included, allows it. A pasted link gets a clear answer and the way to add photos by hand. */
export async function listingLinkHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const addr = parseAddress(text);
  const props = await ctx.store.list("properties", ctx.userId);
  const prop = (addr ? props.find((p) => p.address.toLowerCase().startsWith(addr.toLowerCase().split(/\s+/).slice(0, 2).join(" "))) : null) ?? (ctx.state.last_property_id ? props.find((p) => p.id === ctx.state.last_property_id) : undefined);
  const msg = "I can't read listing links, and no listing site or MLS lets me. Add the photos yourself: find them on Zillow or Redfin, save them to your phone or computer, and add them to the home here.";
  return reply(msg, [{ type: "notice", tone: "info", title: "Add the photos yourself", body: "Open the listing on Zillow or Redfin, save the photos, then add them on the property page. Only use photos you have the right to share.", buttons: [{ label: prop ? `Add photos to ${prop.address}` : "Open properties", style: "primary", href: prop ? `/properties/${prop.id}` : "/properties" }] }], "smalltalk");
}

/** "…and include photos of 12 Oak St": the agent's OWN uploaded photos for that home, ready to share along with a message. Only ever built when the agent asks for photos. */
export const wantsPhotos = (text: string) => /\b(?:photos?|pictures?|pics?|images?)\b/i.test(text) && /\b(?:with|include|attach|add|send|and)\b/i.test(text);
export async function sharePhotosBlock(ctx: Ctx, text: string, message: string): Promise<Block[]> {
  const props = await ctx.store.list("properties", ctx.userId);
  const addr = parseAddress(text)?.toLowerCase();
  const prop = (addr ? props.find((p) => p.address.toLowerCase().startsWith(addr.split(/\s+/).slice(0, 2).join(" "))) : null) ?? (ctx.state.last_property_id ? props.find((p) => p.id === ctx.state.last_property_id) : undefined);
  if (!prop) return [{ type: "notice", tone: "info", title: "Which home's photos?", body: "Tell me the address and I'll line them up to share." }];
  const own = (await ctx.store.list("property_images", ctx.userId)).filter((i) => i.property_id === prop.id && i.url.startsWith("/api/files/")).sort((a, b) => a.position - b.position).slice(0, 10);
  if (!own.length) return [{ type: "notice", tone: "info", title: `No photos saved for ${prop.address}`, body: "Add your own photos on the property page and I can share them in texts, emails and posts.", buttons: [{ label: "Add photos", style: "primary", href: `/properties/${prop.id}` }] }];
  return [{ type: "share_photos", title: `Photos of ${prop.address}`, message, photos: own.map((i) => ({ url: i.url })) }];
}
