import { classifyProperty, kindFacts } from "../property-kind";
import { getProvider, aiAvailable, estimateCost } from "../ai/provider";
import { recordUsage } from "../credits";
import { fmtDay, fmtRange, fmtShortDate } from "../time";
import type { Contact, Profile, Property, SocialSlide } from "../types";
import type { Ctx } from "./context";
import { firstName, fullMoney } from "./context";
import { type ListingPostData, listingPostData } from "../content/listing-data";
import { buildPost } from "../content/templates";
import type { PropertyExtra } from "../listing-data/rentcast";

/**
 * Message generation. Templates are free and deterministic and are used by
 * default; if an AI provider is configured the fast/cheap tier may polish the
 * wording. Property facts are only ever used when the agent has verified them.
 */

export function signature(p: Profile) {
  return [p.full_name, p.role !== "Agent" ? p.role : null, p.brokerage].filter(Boolean).join("\n");
}

export function verifiedFacts(prop: Property | null | undefined): string[] {
  if (!prop?.verified) return [];
  return kindFacts(classifyProperty({ address: prop.address, beds: prop.beds, baths: prop.baths, sqft: prop.sqft, description: prop.description }), prop, fullMoney); // a warehouse never says "0 bed"
}

export function openHouseEmail(ctx: Ctx, prop: Property, start: Date, end: Date) {
  const day = fmtDay(start, ctx.tz), date = fmtShortDate(start, ctx.tz), range = fmtRange(start, end, ctx.tz);
  const facts = verifiedFacts(prop);
  return {
    subject: `Open House — ${prop.address}`,
    body: [
      "Hi {{first_name}},",
      "",
      `I wanted you to be one of the first to know: I'm hosting an open house at ${prop.address}${prop.city ? `, ${prop.city}` : ""} this ${day}, ${date}, from ${range}.`,
      "",
      ...(facts.length ? ["Here's the quick rundown:", ...facts.map((f) => `• ${f}`), ""] : []),
      "No appointment needed, just stop by whenever it suits you. If that window doesn't work, reply with a time that does and I'll set up a private showing.",
      "",
      "Hope to see you there,",
      signature(ctx.profile),
    ].filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n"),
  };
}

/** Everything we know about a home, ready for a post: price, full address, beds/baths/size, plus year built, lot, HOA, taxes and days on market when known. */
export async function propertyPostData(ctx: Ctx, prop: Property, o: { sold?: boolean } = {}): Promise<ListingPostData> {
  const mems = await ctx.store.list("memories", ctx.userId);
  let extra: PropertyExtra | null = null;
  try { const raw = mems.find((m) => m.key === `cache:property_lookup:${prop.id}`)?.value; extra = raw ? ((JSON.parse(raw) as { extra?: PropertyExtra }).extra ?? null) : null; } catch { /* no lookup yet */ }
  const txn = mems.find((m) => m.scope === "property" && m.subject_id === prop.id && m.key === "Transaction")?.value ?? "";
  const soldPrice = o.sold && /^Sold/i.test(txn) ? Number(/\$([\d,]+)/.exec(txn)?.[1]?.replace(/,/g, "")) || null : null;
  return listingPostData(prop, { extra, soldPrice });
}

export async function openHouseSocial(ctx: Ctx, prop: Property, start: Date | null, end: Date | null, imageIds: string[]) {
  const d = await propertyPostData(ctx, prop);
  const built = buildPost({
    category: "open_house", platform: "instagram", variant: 0, name: ctx.profile.full_name, role: ctx.profile.role, brokerage: ctx.profile.brokerage, market: ctx.profile.primary_market || ctx.profile.location || undefined,
    property: { address: prop.address, city: prop.city, state: prop.state, zip: prop.zip, facts: d.stats, details: d.details, descriptors: d.descriptors, fullAddress: d.fullAddress, placeLine: d.placeLine },
    when: start && end ? { day: fmtDay(start, ctx.tz), range: fmtRange(start, end, ctx.tz) } : null,
  });
  const slides: SocialSlide[] = built.slides.map((sl, i) => ({ ...sl, image_id: imageIds[i] ?? imageIds[0] ?? null }));
  return { slides, caption: built.caption, hashtags: built.hashtags };
}

export type LeadClass = "financing" | "nurture" | "seller" | "rental" | "investor" | "hot" | "general";

export function classifyNotes(notes: string | null | undefined): LeadClass {
  const t = (notes ?? "").toLowerCase();
  if (/financ|pre-?approv|lender|mortgage|loan|down payment|rate/.test(t)) return "financing";
  if (/sell|list (?:my|our)|home value|what'?s my home worth/.test(t)) return "seller";
  if (/\brent|lease|tenant/.test(t)) return "rental";
  if (/invest|rental property|cash flow|flip/.test(t)) return "investor";
  if (/just (starting|looking|browsing)|early|no rush|someday|exploring/.test(t)) return "nurture";
  if (/ready|asap|offer|this month|pre-?approved|serious|second showing/.test(t)) return "hot";
  return "general";
}

export function followUpEmail(ctx: Ctx, c: Contact, prop: Property | null, notes: string | null, visit: "open_house" | "showing" = "open_house") {
  const cls = classifyNotes(notes);
  const where = visit === "showing" ? (prop ? `the showing at ${prop.address}` : "the showing") : prop ? `the open house at ${prop.address}` : "the open house";
  const first = firstName(c.name);
  const open = visit === "showing" ? `Hi ${first},\n\nThank you for taking the time to see ${prop ? prop.address : "the home"}. I enjoyed showing it to you.` : `Hi ${first},\n\nThank you for stopping by ${where}. It was great to meet you.`;
  const sign = `\n\n${signature(ctx.profile)}`;
  const bodies: Record<LeadClass, string> = {
    financing: `${open}\n\nYou mentioned you had questions about financing. I'm happy to share what I've seen work for other buyers and connect you with a trusted lender who can walk you through pre-approval and what to expect on rates and down payment. Would a quick call this week work?${sign}`,
    nurture: `${open}\n\nNo rush at all. Whenever you're ready to keep looking, I'm glad to send you homes that fit what you want, or just answer questions as they come up. If it's helpful, I can set up a simple weekly list of new listings.${sign}`,
    seller: `${open}\n\nYou mentioned you may be thinking about selling. I'd be happy to put together a no-pressure look at what homes like yours are doing in the neighborhood. Want me to send that over?${sign}`,
    rental: `${open}\n\nYou mentioned you're exploring rentals. Tell me your timing and must-haves and I'll keep an eye out for options.${sign}`,
    investor: `${open}\n\nYou mentioned an interest in investing. If you tell me your target returns, areas and budget, I'll watch for opportunities that fit.${sign}`,
    hot: `${open}\n\nIt sounded like you're ready to move. I'd love to set up private showings and talk through next steps — what days work best for you this week?${sign}`,
    general: `${open}\n\nIf you'd like to see more homes like it, or have any questions about the property or the area, just reply here and I'll be glad to help.${sign}`,
  };
  const subject = visit === "showing" ? (prop ? `Thoughts on ${prop.address}?` : "Thoughts on the home?") : prop ? `Great meeting you at ${prop.address}` : "Great meeting you";
  return { subject, body: bodies[cls], cls };
}

/** Optional wording polish via the cheapest capable model. Returns the original text on any failure. */
export async function polish(ctx: Ctx, kind: string, text: string): Promise<string> {
  if (!aiAvailable()) return text;
  try {
    const p = getProvider();
    const r = await p.complete({
      tier: "fast", maxTokens: 700,
      system: "You edit real-estate agent communications. Keep every fact, name, date, time and address EXACTLY as written. Do not add facts (no prices, bedrooms, amenities) that are not in the text. Improve warmth and flow lightly. Preserve '{{first_name}}' placeholders and the signature block. Return only the edited text.",
      messages: [{ role: "user", content: text }],
    });
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: `polish_${kind}`, creditKey: "email_generation", creditsOverride: 0, tier: "fast", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) });
    ctx.usage.aiCalls++;
    return r.text.trim() || text;
  } catch {
    return text;
  }
}
