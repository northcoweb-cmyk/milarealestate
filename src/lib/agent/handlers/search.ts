import { aiAvailable, estimateCost, getProvider } from "../../ai/provider";
import { recordUsage } from "../../credits";
import { fmtShortDate } from "../../time";
import type { Block } from "../../types";
import type { Ctx } from "../context";
import { fence } from "../llm";
import { contactFacts } from "../memory";
import { logError } from "../../server/errors";
import { mentionedContacts } from "./contacts";
import { type HandlerOut, reply } from "./types";

/**
 * A client's search brief ("find them an apartment: legal weed, walkable at night, balcony, under $2,500, within 5 hours of Maryland").
 * This is the job a sharp relocation agent would do: turn the brief into requirements, check the hard facts, say where the wish list
 * conflicts with the budget, shortlist the best fits with sources, and say what is still unverified. It uses the smartest model tier.
 */
const SYSTEM = (who: string, today: string) => `You are Mila, a senior partner to a US real-estate agent (${who}). Today is ${today}. The agent's client(s) have a search brief. Do the real work a very sharp rental / relocation / buyer's agent would do, and think ahead for them.

How to think, in order:
1. READ THE BRIEF LIKE A PERSON. Turn it into requirements and mark each HARD (deal-breaker) or SOFT (nice to have). Interpret sensibly: "within 4 to 5 hours of Maryland" includes Maryland itself, so do not skip the agent's home market. Notice anything impossible or in tension (for example a luxury, urban, floor-to-ceiling-window building at a low rent in an expensive metro).
2. CHECK THE HARD FACTS WITH WEB SEARCH BEFORE RECOMMENDING ANYTHING. Laws and prices change: confirm today's status of recreational cannabis by state (legal to possess is not the same as legal retail stores being open, and rental buildings often ban smoking), real drive times from Maryland, current rent ranges for the size that fits the budget, resident reviews (apartments.com, Google, Yelp: report what you actually found), whether the building offers real 3D / virtual tours, and objective walkability and safety indicators (Walk Score, transit, official or news-reported crime data, with the source).
3. BE HONEST ABOUT CONFLICTS. If the budget cannot buy the whole wish list in the best-fit areas, say which items must give and propose the best trade.
4. SHORTLIST 3 TO 5. Name a specific building only if you found it in search results. Otherwise name the neighborhood and say what to filter for. NEVER invent a building, a rent, a review score, a tour link or a statistic. For each entry give: where, why it fits, a short fit line per hard requirement using the marks ✔ ✖ ?, typical rent, and the biggest risk.
5. SAY WHAT YOU COULD NOT VERIFY, and how the agent can check it in minutes.
6. FAIR HOUSING: never steer by race, religion, national origin, family status, disability or other protected class, and never describe a neighborhood by who lives there. Use objective, sourced indicators only.
7. NEXT STEPS: offer 1 to 3 things the agent can have Mila do next, each as a plain instruction the agent could send (for example "Draft an email to the clients with this shortlist", "Save these requirements to the clients' profile", "Add a task to book tours for the top two").

The brief (and any follow-up from the agent) is in the user message. Do not attach it to a client the agent did not name.

Reply with ONLY one JSON object, no other text:
{"bottom_line": string (2-3 sentences: the honest answer and the single most important trade-off),
 "requirements": [{"item": string, "kind": "hard"|"soft"}],
 "conflicts": [string],
 "shortlist": [{"name": string, "where": string, "why": string, "fit": string, "rent": string, "risk": string}],
 "unverified": [string],
 "next": [{"label": string (max 40 chars), "prompt": string}],
 "question": string|null}`;

type Out = {
  bottom_line?: string; requirements?: { item?: string; kind?: string }[]; conflicts?: string[];
  shortlist?: { name?: string; where?: string; why?: string; fit?: string; rent?: string; risk?: string }[];
  unverified?: string[]; next?: { label?: string; prompt?: string }[]; question?: string | null;
};
const list = (a: unknown): string[] => (Array.isArray(a) ? a.map((x) => String(x ?? "").trim()).filter(Boolean) : []);

export async function clientSearchHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  ctx.state.last_search = { text: text.slice(0, 2500), at: Date.now() };
  if (!aiAvailable()) {
    return reply("I can help with this, but the research needs my AI service, which isn't available right now, and I won't guess at laws, prices or buildings. Here is how I read the brief so you don't lose it:", [{
      type: "notice", tone: "info", title: "Their brief, saved", body: text.slice(0, 900),
    }], "smalltalk");
  }
  ctx.steps.push("Reading the brief", "Checking laws, rents and reviews");
  const known = await mentionedContacts(ctx, text); // only people the agent actually named
  const facts = known.length ? (await Promise.all(known.slice(0, 2).map(async (c) => `${c.name}: ${(await contactFacts(ctx, c)).join("; ") || "no saved details"}`))).join("\n") : "";
  const today = `${fmtShortDate(ctx.now, ctx.tz)}, ${new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, year: "numeric" }).format(ctx.now)}`;
  const who = `${ctx.profile.full_name}${ctx.profile.brokerage ? `, ${ctx.profile.brokerage}` : ""}${ctx.profile.primary_market || ctx.profile.location ? `, works in ${ctx.profile.primary_market || ctx.profile.location}` : ""}`;
  try {
    const r = await getProvider().complete({
      tier: "reasoning", effort: "medium", webSearch: true, maxTokens: 3500,
      system: SYSTEM(who, today),
      messages: [{ role: "user", content: `${fence(text, 3500)}${facts ? `\n\nSaved details for people named above:\n${fence(facts, 1200)}` : ""}` }],
    });
    ctx.usage.aiCalls++;
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: "client_search", creditKey: "market_research", creditsOverride: 0, tier: "reasoning", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) + (r.extraCostUsd ?? 0) });
    let j: Out | null = null;
    try { j = JSON.parse(/\{[\s\S]*\}/.exec(r.text)?.[0] ?? "null") as Out | null; } catch { j = null; }
    if (!j?.bottom_line) {
      const plain = r.text.trim();
      if (plain) return reply(plain.slice(0, 3000), [], "market_research");
      return reply("I wasn't able to finish that search just now. Try again in a moment, or send the brief again with the city you want me to focus on.", [], "smalltalk");
    }
    const blocks: Block[] = [];
    const reqs = (j.requirements ?? []).filter((x) => x?.item);
    if (reqs.length) {
      const hard = reqs.filter((x) => x.kind !== "soft").map((x) => x.item), soft = reqs.filter((x) => x.kind === "soft").map((x) => x.item);
      blocks.push({ type: "notice", tone: "info", title: "How I read their brief", body: [hard.length ? `Must have: ${hard.join(", ")}` : "", soft.length ? `Nice to have: ${soft.join(", ")}` : ""].filter(Boolean).join("\n") });
    }
    const conflicts = list(j.conflicts);
    if (conflicts.length) blocks.push({ type: "notice", tone: "warn", title: "Where the wish list pushes against the budget", body: conflicts.map((c) => `• ${c}`).join("\n") });
    const short = (j.shortlist ?? []).filter((x) => x?.name).slice(0, 5);
    const sources = (r.citations ?? []).slice(0, 8);
    if (short.length) {
      blocks.push({
        type: "market", title: "Best fits for your clients", location: "Shortlist", asOf: today,
        dataPeriod: sources.length ? "Sources below. Confirm rent and availability before you send anything." : "No live sources came back. Treat this as a starting point and verify.",
        bullets: short.map((x) => [`${x.name}${x.where ? ` (${x.where})` : ""}`, x.why, x.fit, x.rent ? `Rent: ${x.rent}` : "", x.risk ? `Watch: ${x.risk}` : ""].filter(Boolean).join(". ")),
        sources,
      });
    }
    const unverified = list(j.unverified);
    if (unverified.length) blocks.push({ type: "notice", tone: "warn", title: "Not verified yet", body: unverified.map((c) => `• ${c}`).join("\n") });
    const next = (j.next ?? []).filter((n) => n?.label && n?.prompt).slice(0, 3);
    if (next.length) blocks.push({ type: "choice", title: "Want me to…", buttons: next.map((n, i) => ({ label: String(n.label).slice(0, 40), style: i === 0 ? ("primary" as const) : ("secondary" as const), action: { type: "prompt", text: String(n.prompt).slice(0, 300) } })) });
    const q = typeof j.question === "string" && j.question.trim() ? `\n\nOne thing that would sharpen this: ${j.question.trim()}` : "";
    return reply(`${j.bottom_line.trim()}${q}`, blocks, "market_research");
  } catch (e) {
    await logError({ source: "ai", message: `client_search: ${e instanceof Error ? e.message : e}`, userId: ctx.userId, email: ctx.profile.email });
    return reply("I couldn't finish that search right now, and I don't want to guess. Your brief is saved, so just say \"search again\" in a minute.", [], "smalltalk");
  }
}
