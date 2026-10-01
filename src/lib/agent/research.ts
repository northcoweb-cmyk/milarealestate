import { aiAvailable, estimateCost, getProvider } from "../ai/provider";
import { recordUsage } from "../credits";
import { fmtShortDate } from "../time";
import type { Block } from "../types";
import { type Ctx } from "./context";
import { CACHE_PREFIX } from "./memory";

/**
 * Live market answers. Uses the provider's web-search tool; never answers
 * market statistics from model memory. Cached 12h per location/question so
 * repeated asks don't re-spend credits.
 */
const TTL = 12 * 3_600_000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function marketResearch(ctx: Ctx, location: string, question: string): Promise<{ block: Block; cached: boolean } | { error: string; connect?: boolean }> {
  if (!aiAvailable()) return { error: "Live market research needs Mila's research connection, which isn't set up on this server yet. I won't guess at current numbers.", connect: true };
  const key = `${CACHE_PREFIX}market:${norm(location)}:${norm(question).slice(0, 80)}`;
  const mems = await ctx.store.list("memories", ctx.userId);
  const hit = mems.find((m) => m.key === key);
  if (hit && Date.now() - new Date(hit.updated_at).getTime() < TTL) {
    try { return { block: JSON.parse(hit.value) as Block, cached: true }; } catch { /* refetch */ }
  }
  const today = fmtShortDate(ctx.now, ctx.tz) + ", " + new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, year: "numeric" }).format(ctx.now);
  try {
    const r = await getProvider().complete({
      tier: "research", maxTokens: 1500, webSearch: true,
      system: `You are a real-estate market analyst for a US agent. Today is ${today}. Use web search to find CURRENT data from reputable sources (Redfin, Zillow, Realtor.com, local MLS or Realtors association reports, Census, Fannie Mae/Freddie Mac for rates). Never state a statistic you did not find in a source, and never invent MLS data. If you only found regional or national figures, say so. Reply with ONLY JSON: {"bullets": [string,...up to 6 concise, specific findings with numbers], "dataPeriod": "which month/quarter the data covers", "caveat": "one sentence on data limits, e.g. not MLS data"}.`,
      messages: [{ role: "user", content: `Location: ${location}\nQuestion: ${question}` }],
    });
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: "market_research", creditKey: "market_research", tier: "research", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) });
    ctx.usage.aiCalls++;
    const j = JSON.parse(/\{[\s\S]*\}/.exec(r.text)?.[0] ?? "{}") as { bullets?: string[]; dataPeriod?: string; caveat?: string };
    if (!j.bullets?.length) return { error: "I couldn't find reliable current data for that. Try a more specific area." };
    const sources = (r.citations ?? []).slice(0, 6);
    if (!sources.length) return { error: "I couldn't back that up with sources, so I'm not going to give you numbers. Try a more specific question." };
    const block: Block = { type: "market", title: question.length < 70 ? question : `Market update — ${location}`, location, asOf: today, dataPeriod: [j.dataPeriod, j.caveat].filter(Boolean).join(" · ") || "See sources", bullets: j.bullets, sources };
    const existing = mems.find((m) => m.key === key);
    if (existing) await ctx.store.update("memories", ctx.userId, existing.id, { value: JSON.stringify(block) });
    else await ctx.store.insert("memories", ctx.userId, { scope: "business", subject_id: null, key, value: JSON.stringify(block), source: "system", confidence: 1, pinned: false });
    return { block, cached: false };
  } catch (e) {
    return { error: `I couldn't reach live market data: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}
