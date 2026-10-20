/**
 * Things an agent says about a home they already have: its status ("coming soon", "going live"), a list date, an offer,
 * a note, and the details they give right after adding it ("it's 4 bed 2.5 bath, around 2400 sqft"). Everything is saved on
 * THAT property, never as a contact, never as a guess, and Mila says exactly what she saved.
 */
import { STAGE_KEY } from "../../property-stage";
import type { Property } from "../../types";
import { type Ctx, fullMoney } from "../context";
import { persistState } from "../conversation";
import { extractListingFacts } from "../listing";
import { saveMemory } from "../memory";
import { parseAddress, parseDate, parseMoney } from "../nlu";
import { TOOLS } from "../tools";
import { resolveProperty } from "./listing";
import { transactionHandler } from "./deals";
import { type HandlerOut, reply } from "./types";
import { fmtDay, fmtShortDate, zonedToUtc } from "../../time";

const STATUS_WORDS: { re: RegExp; stage: "upcoming" | "active" | "under_contract" | "sold" | "archived"; label: string }[] = [
  { re: /\bcoming soon\b/i, stage: "upcoming", label: "Coming soon" },
  { re: /\b(?:under contract|pending|in contract)\b/i, stage: "under_contract", label: "Under contract" },
  { re: /\b(?:sold|closed)\b/i, stage: "sold", label: "Sold" },
  { re: /\b(?:off market|withdrawn|expired|canceled|cancelled|taken off|set aside)\b/i, stage: "archived", label: "Off the market" },
  { re: /\b(?:active|live|listed|on the market|going live|goes live|went live|hit the market|public)\b/i, stage: "active", label: "Active (live)" },
];

/** A saved home the message is about: a full address, a street name, or the one just discussed. */
async function homeOf(ctx: Ctx, text: string): Promise<Property | null> {
  return resolveProperty(ctx, text, true);
}

export function statusAsk(text: string): boolean {
  const t = text.toLowerCase();
  if (/\?\s*$/.test(t) && !/^\s*(?:please\s+)?(?:mark|set|change|update)\b/.test(t)) return false;
  return /^(?:(?:please|ok|okay|hey|and|also|so|then)[,\s]+)*(?:mark|set|change|update|flip|move)\b[^.]{0,80}\b(?:as|to)\s+(?:being\s+)?(?:coming soon|active|live|listed|on the market|under contract|pending|sold|closed|off market|withdrawn|expired|canceled|cancelled)\b/.test(t)
    || /\b(?:is|are)\s+(?:now\s+|officially\s+)?(?:coming soon|going live|live|active|under contract|pending|off the market|sold)\b[^.]{0,40}(?:status|update)?/.test(t) && /\b(?:status|listing|property|home|house)\b/.test(t)
    || /\b(?:going live|goes live|went live|hits? the market)\b/.test(t) && !!parseAddress(text);
}

export async function propertyStatusHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = await homeOf(ctx, text);
  const hit = STATUS_WORDS.find((s) => s.re.test(text.replace(/\bmark\b/gi, "")));
  if (!hit) return reply("Which status should I set: coming soon, active, under contract, sold, or off the market?", [], "smalltalk");
  if (!prop) {
    const addr = parseAddress(text);
    return reply(`I don't have ${addr ?? "that home"} saved yet, so I haven't changed anything. Say “new listing at ${addr ?? "123 Main Street"}” and I'll add it first.`, [], "smalltalk");
  }
  ctx.state.last_property_id = prop.id; await persistState(ctx);
  if (hit.stage === "under_contract") return transactionHandler(ctx, `${prop.address} is under contract`); // needs the closing date: that handler asks for it once and builds the deadlines
  await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: STAGE_KEY, value: hit.stage, source: "user_stated" });
  await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: "Listing status", value: hit.label, source: "user_stated" });
  const when = parseDate(text, ctx.now, ctx.tz);
  return reply(`Marked ${prop.address} as ${hit.label}.${hit.stage === "active" && when ? ` Go-live: ${fmtDay(zonedToUtc(when.y, when.m, when.d, 12, 0, ctx.tz), ctx.tz)}, ${fmtShortDate(zonedToUtc(when.y, when.m, when.d, 12, 0, ctx.tz), ctx.tz)}.` : ""} It shows that way in Properties.`, [{ type: "choice", title: prop.address, buttons: [{ label: "Open property", style: "secondary", href: `/properties/${prop.id}` }] }], "chat_simple");
}

/** "Set the listing date for 77 Kentlands to Thursday, October 29": saved on the home, with a calendar day and a reminder. */
export function listDateAsk(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(?:list(?:ing)?\s+date|go[- ]live(?:\s+date)?|goes live|go live|going live|go active|hits? the market|on the market (?:on|by))\b/.test(t) && /\b(?:set|update|change|put|make|save|record|we go live|we're going live|goes live|go live)\b/.test(t) && !/\?\s*$/.test(t) && !/\b(?:post|caption|instagram)\b/.test(t);
}

export async function listDateHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = await homeOf(ctx, text);
  const d = parseDate(text, ctx.now, ctx.tz);
  if (!d) return reply("Which date should the listing go live? For example “Thursday, October 29”.", [], "smalltalk");
  if (!prop) return reply(`I don't have that home saved yet, so I haven't set a date. Tell me the address and I'll add it.`, [], "smalltalk");
  const at = zonedToUtc(d.y, d.m, d.d, 9, 0, ctx.tz);
  await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: "List date", value: `${fmtDay(at, ctx.tz)}, ${fmtShortDate(at, ctx.tz)}`, source: "user_stated" });
  await TOOLS.create_calendar_event.run(ctx, { title: `Listing goes live — ${prop.address}`, kind: "other", start_at: at.toISOString(), end_at: new Date(at.getTime() + 30 * 60_000).toISOString(), location: prop.address, property_id: prop.id, ignoreConflicts: true });
  ctx.state.last_property_id = prop.id; await persistState(ctx);
  return reply(`Saved: ${prop.address} goes live ${fmtDay(at, ctx.tz)}, ${fmtShortDate(at, ctx.tz)}. It's on your calendar that morning.`, [{ type: "choice", title: "Before it goes live", buttons: [{ label: "New-listing checklist", style: "secondary", action: { type: "prompt", text: `Give me a new-listing checklist for ${prop.address}` } }] }], "chat_simple");
}

/** "We got an offer on 77 Kentlands for $590,000 with a $10,000 seller credit": logged on the home, with a task to respond. */
export function offerAsk(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(?:we |i |just )?(?:got|received|have|had|just got)\s+an?\s+offer\b|\boffer\s+(?:came in|on)\b.*\$/.test(t) && !/\?\s*$/.test(t) && !/\b(?:accepted|ratified|under contract|draft|write|email|text)\b/.test(t) && !/^\s*(?!We\b|I\b|They\b)[A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+)?\s+(?:just\s+)?(?:got|received|had)\b/.test(text);
}

export async function offerHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = await homeOf(ctx, text);
  if (!prop) return reply("Which home is the offer on? Give me the address and I'll log it.", [], "smalltalk");
  const money = parseMoney(text).max;
  const credit = /\$?\s?(\d[\d,.]*\s?[km]?)\s+(?:seller\s+)?(?:closing\s+)?credit/i.exec(text);
  const creditN = credit ? parseMoney(`$${credit[1]}`).max : null;
  const offerN = [...text.matchAll(/\$?\s?(\d[\d,.]*)\s?(k|m)?\b/gi)].map((m) => (/k/i.test(m[2] ?? "") ? parseFloat(m[1].replace(/,/g, "")) * 1000 : /m/i.test(m[2] ?? "") ? parseFloat(m[1].replace(/,/g, "")) * 1e6 : parseFloat(m[1].replace(/,/g, "")))).find((n) => n >= 20_000 && n !== creditN) ?? money;
  const day = ctx.now.toISOString().slice(0, 10);
  const note = `Offer received ${day}${offerN ? `: ${fullMoney(Math.round(offerN))}` : ""}${creditN ? ` with a ${fullMoney(creditN)} seller credit` : ""}`;
  await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: `Offer ${day}`, value: note, source: "user_stated" });
  const due = new Date(ctx.now.getTime() + 86_400_000);
  await TOOLS.create_task.run(ctx, { kind: "task", title: `Respond to the offer — ${prop.address}`, subtitle: note, property_id: prop.id, due_at: due.toISOString(), internal: true });
  ctx.state.last_property_id = prop.id; await persistState(ctx);
  return reply(`Logged on ${prop.address}: ${note.replace(/^Offer received \d{4}-\d{2}-\d{2}:?\s*/, "an offer of ").replace(/^an offer of $/, "an offer")}. The list price is unchanged. I added a to-do to respond.`, [{ type: "choice", title: "Next", buttons: [{ label: "Draft a counter", style: "secondary", action: { type: "prompt", text: `Draft a counter offer email for ${prop.address}` } }, { label: "Open property", style: "quiet", href: `/properties/${prop.id}` }] }], "chat_simple");
}

/** "Add a note to 77 Kentlands: ..." / "log a note on ...": a note on the home, nothing else. */
export function propertyNoteAsk(text: string): boolean {
  return /^\s*(?:(?:please|ok|okay|hey)[,\s]+)*(?:add|log|save|put|record)\s+(?:a\s+)?note\s+(?:on|to|for|about)\s+/i.test(text) && !/\b(?:contact|client|buyer|seller|lead)\s+[A-Z]/.test(text);
}

export async function propertyNoteHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = await homeOf(ctx, text);
  const body = text.replace(/^\s*(?:(?:please|ok|okay|hey)[,\s]+)*(?:add|log|save|put|record)\s+(?:a\s+)?note\s+(?:on|to|for|about)\s+[^:]{2,60}:\s*/i, "").trim();
  if (!prop) return reply("Which home is the note for? I couldn't tell, so nothing was saved.", [], "smalltalk");
  if (!body || body === text.trim()) return reply(`What should the note on ${prop.address} say?`, [], "smalltalk");
  const day = ctx.now.toISOString().slice(0, 10);
  await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: `Note ${day} ${Math.random().toString(36).slice(2, 5)}`, value: body.slice(0, 400), source: "user_stated" });
  ctx.state.last_property_id = prop.id; await persistState(ctx);
  return reply(`Saved to ${prop.address}: “${body.slice(0, 200)}”. Nothing else was changed.`, [], "chat_simple");
}

/** "it's 4 bed 2.5 bath around 2400 sqft" / "It's 5 bed 4 bath, $1,475,000": the details for the home just added. */
export function detailsFollowupAsk(text: string): boolean {
  return /^\s*(?:(?:ok|okay|so|and|well|no|yes)[,.\s]+)*(?:it'?s|its|it is|that one is|the house is|the home is)\s+(?:a\s+)?(?:\$\s?\d|\d+(?:\.\d)?\s*(?:bed|bd|br|bath|ba|sq)|\d[\d,]*\s*(?:sq|sf))/i.test(text);
}

export async function detailsFollowupHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = ctx.state.last_property_id ? await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id) : null;
  if (!prop) return reply("Which home is that for? Give me the address with the details.", [], "smalltalk");
  const f = extractListingFacts(text);
  const patch: Record<string, unknown> = {};
  const saved: string[] = [];
  if (f.beds != null) { patch.beds = f.beds; saved.push(`${f.beds} bd`); }
  if (f.baths != null) { patch.baths = f.baths; saved.push(`${f.baths} ba`); }
  if (f.sqft != null) { patch.sqft = f.sqft; saved.push(`${f.sqft.toLocaleString("en-US")} sq ft`); }
  if (f.list_price != null) { patch.list_price = f.list_price; saved.push(fullMoney(f.list_price)); }
  if (!saved.length) return reply("I didn't catch the details. Try “it's 3 bed 2 bath, $480k”.", [], "smalltalk");
  const upd = await ctx.store.update("properties", ctx.userId, prop.id, { ...patch, verified: true } as never);
  if (!upd) return reply("I couldn't save that, so nothing changed.", [], "smalltalk");
  return reply(`Saved on ${prop.address}: ${saved.join(" · ")}.${/\b(?:list for|price|worth|value)\b/i.test(text) && f.list_price == null ? " I can't suggest a price without recent comps; ask me for comps when research is available, or tell me the price you have in mind." : ""}`, [{ type: "choice", title: prop.address, buttons: [{ label: "Open property", style: "secondary", href: `/properties/${prop.id}` }] }], "chat_simple");
}
