import { getProvider, aiAvailable, estimateCost } from "../ai/provider";
import { recordUsage } from "../credits";
import { fmtDay, fmtRange, fmtShortDate } from "../time";
import type { Contact, Profile, Property, SocialSlide } from "../types";
import type { Ctx } from "./context";
import { firstName, fullMoney } from "./context";

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
  const f: string[] = [];
  if (prop.beds) f.push(`${prop.beds} bed`);
  if (prop.baths) f.push(`${prop.baths} bath`);
  if (prop.sqft) f.push(`${prop.sqft.toLocaleString()} sq ft`);
  if (prop.list_price) f.push(`Offered at ${fullMoney(prop.list_price)}`);
  return f;
}

export function openHouseEmail(ctx: Ctx, prop: Property, start: Date, end: Date) {
  const day = fmtDay(start, ctx.tz), date = fmtShortDate(start, ctx.tz), range = fmtRange(start, end, ctx.tz);
  const facts = verifiedFacts(prop);
  return {
    subject: `Open House — ${prop.address}`,
    body: [
      "Hi {{first_name}},",
      "",
      `I'm hosting an open house at ${prop.address}${prop.city ? `, ${prop.city}` : ""} this ${day}, ${date}, from ${range}.`,
      facts.length ? `\n${facts.join(" • ")}\n` : "",
      "Stop by to see the home in person — no appointment needed. If you can't make it but would like a private showing, just reply and I'll set one up.",
      "",
      "Hope to see you there,",
      signature(ctx.profile),
    ].filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n"),
  };
}

export function openHouseSocial(ctx: Ctx, prop: Property, start: Date, end: Date, imageIds: string[]) {
  const day = fmtDay(start, ctx.tz), range = fmtRange(start, end, ctx.tz);
  const facts = verifiedFacts(prop);
  const slides: SocialSlide[] = [
    { role: "hero", headline: prop.address, sub: `Open House • ${day} • ${range}`, image_id: imageIds[0] ?? null },
    { role: "highlight", headline: facts.length ? facts.join(" • ") : "Come see it in person", sub: prop.city ?? undefined, image_id: imageIds[1] ?? imageIds[0] ?? null },
    { role: "cta", headline: `Join me ${day}`, sub: `${range} • ${prop.address}`, image_id: imageIds[2] ?? imageIds[0] ?? null },
  ];
  const caption = [
    `Open House this ${day}! 🏡`,
    "",
    `${prop.address}${prop.city ? `, ${prop.city}` : ""}`,
    `${day} • ${range}`,
    facts.length ? facts.join(" • ") : "",
    "",
    "Stop by, take a look, and bring your questions. I'd love to meet you.",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
  return { slides, caption, hashtags: ["#OpenHouse", "#RealEstate", ...(prop.city ? ["#" + prop.city.replace(/\W/g, "")] : []), "#HomesForSale"] };
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

export function followUpEmail(ctx: Ctx, c: Contact, prop: Property | null, notes: string | null) {
  const cls = classifyNotes(notes);
  const where = prop ? `the open house at ${prop.address}` : "the open house";
  const first = firstName(c.name);
  const open = `Hi ${first},\n\nThank you for stopping by ${where}. It was great to meet you.`;
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
  const subject = prop ? `Great meeting you at ${prop.address}` : "Great meeting you";
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
