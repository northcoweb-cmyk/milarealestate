import type { Block, Property } from "../../types";
import type { Ctx } from "../context";
import { fullMoney } from "../context";
import { persistState } from "../conversation";
import { saveMemory } from "../memory";
import { parseAddress } from "../nlu";
import { type HandlerOut, reply } from "./types";

export const WORKSHEET_KEY = "Listing worksheet";
export const WORKSHEET_FIELDS = [
  { key: "sellers", label: "Seller name(s)", placeholder: "The Hendersons" },
  { key: "price", label: "List price", placeholder: "$650,000" },
  { key: "commission", label: "Commission", placeholder: "2.5%" },
  { key: "term", label: "Listing term", placeholder: "180 days" },
  { key: "start", label: "Start date", placeholder: "Oct 20" },
  { key: "included", label: "Included with the home", placeholder: "fridge, washer, dryer" },
  { key: "excluded", label: "Not included", placeholder: "dining room chandelier" },
  { key: "notes", label: "Special terms or notes", placeholder: "lockbox, showing hours" },
] as const;

async function findProp(ctx: Ctx, text: string): Promise<Property | null> {
  const props = await ctx.store.list("properties", ctx.userId);
  const addr = parseAddress(text)?.toLowerCase();
  const hit = addr ? props.find((p) => p.address.toLowerCase().startsWith(addr.split(/\s+/).slice(0, 2).join(" "))) : null;
  return hit ?? (ctx.state.last_property_id ? props.find((p) => p.id === ctx.state.last_property_id) ?? null : null);
}

/** "I need the listing agreement for 12 Oak": ask first, then fill the worksheet together. Never invents legal language. */
export async function listingAgreementHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = await findProp(ctx, text);
  if (!prop) return reply("Which listing is the agreement for? Give me the address.", [], "smalltalk");
  ctx.state.last_property_id = prop.id; await persistState(ctx);
  return reply(`I can't write your brokerage's legal contract, but I can fill in a worksheet with the terms for ${prop.address} and make a PDF to go over with the seller. Want me to?`, [{ type: "choice", title: "Listing agreement worksheet", buttons: [
    { label: "Yes, fill it out", style: "primary", action: { type: "listing_worksheet_start", propertyId: prop.id } },
    { label: "Upload my own agreement", style: "secondary", href: `/properties/${prop.id}` },
  ] }], "smalltalk");
}

export async function worksheetForm(ctx: Ctx, propertyId: string): Promise<HandlerOut> {
  const prop = await ctx.store.get("properties", ctx.userId, propertyId);
  if (!prop) return reply("I couldn't find that listing.", [], "smalltalk");
  const mems = await ctx.store.list("memories", ctx.userId);
  const saved = (() => { try { return JSON.parse(mems.find((m) => m.scope === "property" && m.subject_id === prop.id && m.key === WORKSHEET_KEY)?.value ?? "{}") as Record<string, string>; } catch { return {}; } })();
  const seller = mems.find((m) => m.scope === "property" && m.subject_id === prop.id && m.key === "Seller")?.value;
  const pre: Record<string, string> = { sellers: seller ?? "", price: prop.list_price ? fullMoney(prop.list_price) : "", ...saved };
  return reply("Here's the worksheet. I filled in what I already know. Fill in the rest, or skip what's not decided.", [{
    type: "questions", title: `Listing worksheet · ${prop.address}`, action: "listing_worksheet", context: { propertyId: prop.id }, submitLabel: "Save worksheet",
    fields: WORKSHEET_FIELDS.map((f) => ({ key: f.key, label: f.label, placeholder: f.placeholder, value: pre[f.key] ?? "" })),
  }], "smalltalk");
}

export async function saveWorksheet(ctx: Ctx, propertyId: string, answers: Record<string, string>): Promise<HandlerOut> {
  const prop = await ctx.store.get("properties", ctx.userId, propertyId);
  if (!prop) return reply("I couldn't find that listing.", [], "smalltalk");
  const clean = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, String(v ?? "").trim().slice(0, 300)]).filter(([k, v]) => v && WORKSHEET_FIELDS.some((f) => f.key === k)));
  await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: WORKSHEET_KEY, value: JSON.stringify(clean), source: "user_stated" });
  const blocks: Block[] = [{ type: "choice", title: "Worksheet saved", body: "Open the PDF to review it or print it for the seller.", buttons: [
    { label: "📄 Open the PDF", style: "primary", href: `/api/properties/${prop.id}/agreement-pdf` },
    { label: "Open property", style: "quiet", href: `/properties/${prop.id}` },
  ] }];
  return reply(`Saved the worksheet for ${prop.address}.`, blocks, "smalltalk");
}
