import { plainText } from "../plain";
import { aiAvailable, estimateCost, getProvider } from "../../ai/provider";
import { recordUsage } from "../../credits";
import { fmtShortDate } from "../../time";
import type { Block } from "../../types";
import type { Ctx } from "../context";
import { fence } from "../llm";
import { contactFacts } from "../memory";
import { RESEARCH_FUNCTIONS, researchRunner } from "../research-tools";
import { logError } from "../../server/errors";
import { mentionedContacts } from "./contacts";
import { type HandlerOut, reply } from "./types";

/**
 * Research for the agent: a client's search brief, a rental or rent level, a specific building or unit, a neighbourhood or city, a move,
 * pricing and comps. It runs on the smartest model tier and PULLS DATA ITSELF through tools (rentals, rent estimates, sale listings,
 * property records, ZIP statistics, flood zone and neighbourhood facts) plus live web search for what has no feed (reviews, cannabis rules,
 * building amenities, tours, crime reports). It must say what it checked and what it could not.
 */
const SYSTEM = (who: string, today: string) => `You are Mila, a senior partner to a US real-estate agent (${who}). Today is ${today}. You are doing research for the agent, and you pull the data yourself with your tools instead of guessing.

First work out what is being asked, then do it properly:
- CLIENT BRIEF (a list of wants for a buyer or renter): turn it into requirements marked HARD (deal-breaker) or SOFT. Interpret sensibly ("within 4 to 5 hours of Maryland" includes Maryland itself). Search real inventory, check the facts, say where the wish list conflicts with the budget, and shortlist the best fits.
- A SPECIFIC PLACE (an address, a unit like "Apt 4B", a building, a neighbourhood, a city): get the record, the value or rent estimate, the listing status, and area facts, then add what reviews, tours and local rules say from web search.
- RENT or MARKET NUMBERS: use market_stats, search_rentals and rent_estimate; quote the figures and the area they cover.
- PRICING / COMPS: use property_details and market_stats; give a range, the comps behind it, and the one thing that would move it.
- COMPARING PLACES or choosing AREAS for a client type: check each candidate with area_facts and market_stats, then compare on what matters to that client.

Rules:
1. TOOLS FIRST. Prefer search_rentals / search_for_sale / property_details / rent_estimate / market_stats / area_facts for numbers and inventory. Use web search for reviews, safety reports, legal status (for example recreational cannabis: legal to possess is not the same as legal stores being open, and rental buildings often ban smoking), amenities, tours, and anything the tools do not cover. You may call several tools in a round.
2. NEVER INVENT a building, unit, rent, price, review score, statistic, tour link or law. Every number must come from a tool result or a cited page. If the tools returned nothing, say so plainly.
3. UNITS: when a unit number matters, pass the full address with the unit to the tools. If the data has no unit-level record, say that the figure is for the building or the address.
4. CHECK YOURSELF. Before answering, check each claim against what the tools returned. Say what you could NOT verify and how the agent can check it in a minute.
5. FAIR HOUSING: never steer by race, religion, national origin, family status, disability or other protected class, and never describe a neighbourhood by who lives there. Use objective, sourced indicators (walk score, transit, official crime data, flood zone, amenities).
6. Be concise and specific. The agent will read this on a phone.
7. NEXT STEPS: offer 1 to 3 things the agent can have Mila do next, each as a plain instruction the agent could send (for example "Draft an email to the clients with this shortlist", "Add a task to book tours for the top two", "Save these requirements to the clients' profile").

The request (and any follow-up) is in the user message. Do not attach it to a client the agent did not name.

When you are done, reply with ONLY one JSON object, no other text:
{"bottom_line": string (2 to 4 sentences: the direct answer and the most important trade-off or caveat; start with one fitting emoji; plain text, no markdown),
 "requirements": [{"item": string, "kind": "hard"|"soft"}]  (only for a client brief, else []),
 "facts": [{"label": string, "value": string, "source": string}]  (the key numbers you pulled, each with where it came from),
 "conflicts": [string],
 "shortlist": [{"name": string, "where": string, "why": string, "fit": string (short ✔ ✖ ? marks per hard requirement), "rent": string (rent or price), "risk": string}]  (only when choosing among options),
 "unverified": [string],
 "next": [{"label": string (max 40 chars), "prompt": string}],
 "question": string|null}`;

type Out = {
  bottom_line?: string; requirements?: { item?: string; kind?: string }[]; conflicts?: string[]; facts?: { label?: string; value?: string; source?: string }[];
  shortlist?: { name?: string; where?: string; why?: string; fit?: string; rent?: string; risk?: string }[];
  unverified?: string[]; next?: { label?: string; prompt?: string }[]; question?: string | null;
};
const list = (a: unknown): string[] => (Array.isArray(a) ? a.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
const FRESH = 6 * 3_600_000;

/** A short follow-up ("does that building have a 3D tour?") continues the research the agent just did. */
function withContext(ctx: Ctx, text: string): string {
  const prior = ctx.state.last_search;
  const short = text.split(/\s+/).length <= 20 && !text.includes(prior?.text.slice(0, 60) ?? "\u0000");
  if (prior && Date.now() - prior.at < FRESH && short && /\b(that|this|those|these|the (?:building|place|apartment|unit|area|neighbou?rhood|one|property|first|top|second)|it|there|they|them|same|again|more|deeper)\b/i.test(text)) return `${prior.text}\n\nFollow-up from the agent: ${text}`;
  return text;
}

export async function clientSearchHandler(ctx: Ctx, textIn: string): Promise<HandlerOut> {
  const text = withContext(ctx, textIn);
  ctx.state.last_search = { text: text.slice(0, 2500), at: Date.now() };
  if (!aiAvailable()) {
    return reply("I can do this research, but it needs my AI service, which isn't available right now, and I won't guess at laws, prices or buildings. I've kept the request so you don't lose it:", [{
      type: "notice", tone: "info", title: "Saved request", body: text.slice(0, 900),
    }], "smalltalk");
  }
  ctx.steps.push("Reading the request");
  const known = await mentionedContacts(ctx, text); // only people the agent actually named
  const facts = known.length ? (await Promise.all(known.slice(0, 2).map(async (c) => `${c.name}: ${(await contactFacts(ctx, c)).join("; ") || "no saved details"}`))).join("\n") : "";
  const today = `${fmtShortDate(ctx.now, ctx.tz)}, ${new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, year: "numeric" }).format(ctx.now)}`;
  const who = `${ctx.profile.full_name}${ctx.profile.brokerage ? `, ${ctx.profile.brokerage}` : ""}${ctx.profile.primary_market || ctx.profile.location ? `, works in ${ctx.profile.primary_market || ctx.profile.location}` : ""}`;
  try {
    const r = await getProvider().complete({
      tier: "reasoning", effort: "medium", webSearch: true, maxTokens: 3500, maxToolRounds: 5,
      system: SYSTEM(who, today),
      functions: RESEARCH_FUNCTIONS.map((f) => ({ name: f.name, description: f.description, parameters: f.parameters as unknown as Record<string, unknown> })),
      runFunction: researchRunner(ctx),
      messages: [{ role: "user", content: `${fence(text, 3500)}${facts ? `\n\nSaved details for people named above:\n${fence(facts, 1200)}` : ""}` }],
    });
    ctx.usage.aiCalls++;
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: "client_search", creditKey: "market_research", creditsOverride: 0, tier: "reasoning", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) + (r.extraCostUsd ?? 0) });
    let j: Out | null = null;
    try { j = JSON.parse(/\{[\s\S]*\}/.exec(r.text)?.[0] ?? "null") as Out | null; } catch { j = null; }
    if (!j?.bottom_line) {
      const plain = r.text.trim();
      if (plain) return reply(plainText(plain).slice(0, 3000), [], "market_research");
      return reply("I wasn't able to finish that research just now. Try again in a moment, or add the city you want me to focus on.", [], "smalltalk");
    }
    const blocks: Block[] = [];
    const sources = (r.citations ?? []).slice(0, 8);
    const reqs = (j.requirements ?? []).filter((x) => x?.item);
    if (reqs.length) {
      const hard = reqs.filter((x) => x.kind !== "soft").map((x) => x.item), soft = reqs.filter((x) => x.kind === "soft").map((x) => x.item);
      blocks.push({ type: "notice", tone: "info", title: "How I read the brief", body: [hard.length ? `Must have: ${hard.join(", ")}` : "", soft.length ? `Nice to have: ${soft.join(", ")}` : ""].filter(Boolean).join("\n") });
    }
    const keyFacts = (j.facts ?? []).filter((x) => x?.label && x?.value).slice(0, 10);
    if (keyFacts.length) blocks.push({ type: "market", title: "What I pulled", location: "Data", asOf: today, dataPeriod: "Figures come from the sources named on each line. Confirm availability before you share.", bullets: keyFacts.map((x) => `${x.label}: ${x.value}${x.source ? ` (${x.source})` : ""}`), sources: [] });
    const conflicts = list(j.conflicts);
    if (conflicts.length) blocks.push({ type: "notice", tone: "warn", title: "Where the wish list pushes against the budget", body: conflicts.map((c) => `• ${c}`).join("\n") });
    const short = (j.shortlist ?? []).filter((x) => x?.name).slice(0, 5);
    if (short.length) {
      blocks.push({
        type: "market", title: "Best fits", location: "Shortlist", asOf: today,
        dataPeriod: sources.length ? "Sources below. Confirm rent and availability before you send anything." : "No web sources came back. Treat this as a starting point and verify.",
        bullets: short.map((x) => [`${x.name}${x.where ? ` (${x.where})` : ""}`, x.why, x.fit, x.rent ? `Rent/price: ${x.rent}` : "", x.risk ? `Watch: ${x.risk}` : ""].filter(Boolean).join(". ")),
        sources,
      });
    } else if (sources.length) blocks.push({ type: "market", title: "Sources", location: "Web", asOf: today, dataPeriod: "Pages I read for this answer.", bullets: [], sources });
    const unverified = list(j.unverified);
    if (unverified.length) blocks.push({ type: "notice", tone: "warn", title: "Not verified yet", body: unverified.map((c) => `• ${c}`).join("\n") });
    const next = (j.next ?? []).filter((n) => n?.label && n?.prompt).slice(0, 3);
    if (next.length) blocks.push({ type: "choice", title: "Want me to…", buttons: next.map((n, i) => ({ label: String(n.label).slice(0, 40), style: i === 0 ? ("primary" as const) : ("secondary" as const), action: { type: "prompt", text: String(n.prompt).slice(0, 300) } })) });
    const q = typeof j.question === "string" && j.question.trim() ? `\n\nOne thing that would sharpen this: ${j.question.trim()}` : "";
    return reply(plainText(`${j.bottom_line.trim()}${q}`), blocks, "market_research");
  } catch (e) {
    await logError({ source: "ai", message: `client_search: ${e instanceof Error ? e.message : e}`, userId: ctx.userId, email: ctx.profile.email });
    return reply("I couldn't finish that research right now, and I don't want to guess. Your request is saved, so just say \"search again\" in a minute.", [], "smalltalk");
  }
}
