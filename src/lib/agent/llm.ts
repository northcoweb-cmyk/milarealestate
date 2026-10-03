import { aiAvailable, estimateCost, getProvider } from "../ai/provider";
import { recordUsage } from "../credits";
import type { Ctx } from "./context";
import { knowledgeFor } from "./learn";
import { INTENTS, type Detected, type Intent } from "./intents";

/**
 * Optional AI layer. Used only when the rules engine can't classify a
 * request (fast/cheap tier) and for open-ended questions (standard tier).
 * Everything it returns is re-run through the deterministic parsers, so
 * dates, addresses and actions behave identically with or without AI.
 */
export async function llmClassify(ctx: Ctx, text: string): Promise<Detected | null> {
  if (!aiAvailable()) return null;
  try {
    const r = await getProvider().complete({
      tier: "fast", maxTokens: 200,
      system: "You route requests for a real-estate agent's assistant. Pick the single best intent. 'general' means a question or chat that needs no action on the agent's data. Set declared=true only if the user says they ALREADY moved/changed something themselves.",
      messages: [{ role: "user", content: text }],
      jsonSchema: { name: "route", description: "Route the request", schema: { type: "object", properties: { intent: { type: "string", enum: INTENTS }, declared: { type: "boolean" } }, required: ["intent"] } },
    });
    ctx.usage.aiCalls++;
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: "intent_routing", creditKey: "chat_simple", creditsOverride: 0, tier: "fast", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) });
    const j = r.json as { intent?: Intent; declared?: boolean } | undefined;
    return j?.intent && INTENTS.includes(j.intent) ? { intent: j.intent, declared: j.declared } : null;
  } catch {
    return null;
  }
}

export interface ChatReply { text: string; suggestions: { label: string; prompt: string }[] }

const EXPERT = `You are Mila, the AI chief of staff for a US real-estate agent. You are expert in the full transaction lifecycle: lead gen and nurture, buyer consults and agency, pricing and CMAs, listing prep and staging, showings, offers and negotiation, escalation clauses, contingencies (inspection, appraisal, financing, HOA), earnest money, title and closing timelines, post-close follow-up, referrals, social/content marketing and brokerage compliance.
How you work:
- THINK AHEAD. Whatever the agent says, work out what it implies is coming next (deadlines, people to tell, paperwork, risks) and say it briefly. Example: an accepted offer implies inspection, appraisal and financing dates to calendar and a heads-up to the lender and title.
- BE SPECIFIC AND USEFUL. Give the actual script, number, checklist or wording, not generalities. Use the agent's own data (below) by name. Be concise: short paragraphs or tight bullets, no filler, no greeting, no sign-off.
- NEVER invent MLS facts, comps, prices, statistics, laws or deadlines. When something varies by state, county or contract, say so in one line and tell them what to verify (their broker, the contract, the state commission or an attorney).
- FAIR HOUSING: never help steer by race, religion, family status, disability or other protected class; redirect to neutral, property-based language.
- Ask at most ONE question, and only if you truly cannot be useful without it. Otherwise make a sensible assumption, state it, and proceed.
- You cannot change their calendar or contacts in this reply. Instead, offer 0-3 concrete next actions as buttons whose prompt is a plain instruction the agent could send (e.g. "Add a 5 PM showing at 12 Oak Lane tomorrow").`;

export async function llmChat(ctx: Ctx, text: string, history: { role: "user" | "assistant"; content: string }[], extraContext = ""): Promise<ChatReply | null> {
  if (!aiAvailable()) return null;
  try {
    const [know, snap] = await Promise.all([knowledgeFor(ctx, text), (await import("./snapshot")).businessSnapshot(ctx)]);
    const r = await getProvider().complete({
      tier: text.length > 200 || /\b(plan|strategy|analy[sz]e|compare|negotiat|why|explain|script|counter|offer|price|pricing|listing presentation|objection|how (?:do|should|can))\b/i.test(text) ? "standard" : "fast", maxTokens: 900,
      system: `${EXPERT}\n\nThe agent: ${ctx.profile.full_name}${ctx.profile.brokerage ? `, ${ctx.profile.brokerage}` : ""}; ${ctx.profile.location || "location not set"}; ${ctx.profile.experience} agent; focus: ${ctx.profile.business_type}.\n\nTheir business right now:\n${snap}\n\nWhat you have learned about them and their clients:\n${know || "(nothing saved yet)"}${extraContext ? `\n\nRecords relevant to this question (authoritative):\n${extraContext}` : ""}`,
      messages: [...history.slice(-8), { role: "user", content: text }],
      jsonSchema: { name: "reply", description: "Your reply and optional next-step buttons", schema: { type: "object", properties: { reply: { type: "string" }, actions: { type: "array", maxItems: 3, items: { type: "object", properties: { label: { type: "string" }, prompt: { type: "string" } }, required: ["label", "prompt"] } } }, required: ["reply"] } },
    });
    ctx.usage.aiCalls++;
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: "chat", creditKey: "chat_simple", creditsOverride: 0, tier: "fast", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) });
    const j = r.json as { reply?: string; actions?: { label?: string; prompt?: string }[] } | undefined;
    const body = (j?.reply ?? r.text ?? "").trim().replace(/\n+\s*(?:best(?: regards)?|regards|cheers|sincerely|thanks|warmly),?\s*\n?\s*mila\.?\s*$/i, "").trim();
    if (!body) return null;
    const suggestions = (j?.actions ?? []).filter((a) => a?.label && a?.prompt).slice(0, 3).map((a) => ({ label: String(a.label).slice(0, 40), prompt: String(a.prompt).slice(0, 300) }));
    return { text: body, suggestions };
  } catch {
    return null;
  }
}

export async function llmDraftEmail(ctx: Ctx, instruction: string, recipient: string | null, facts: string[]): Promise<{ subject: string; body: string } | null> {
  if (!aiAvailable()) return null;
  try {
    const r = await getProvider().complete({
      tier: "fast", maxTokens: 700,
      system: `Write a short, warm, professional email from US real-estate agent ${ctx.profile.full_name}${ctx.profile.brokerage ? ` (${ctx.profile.brokerage})` : ""}. Use ONLY facts provided. Do not invent listing details, prices or promises. End with the agent's name. Known facts about the recipient: ${facts.join("; ") || "none"}.`,
      messages: [{ role: "user", content: `Recipient: ${recipient ?? "unspecified"}\nInstruction: ${instruction}` }],
      jsonSchema: { name: "email", description: "The drafted email", schema: { type: "object", properties: { subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"] } },
    });
    ctx.usage.aiCalls++;
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: "email_draft", creditKey: "email_generation", creditsOverride: 0, tier: "fast", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) });
    const j = r.json as { subject?: string; body?: string } | undefined;
    return j?.subject && j?.body ? { subject: j.subject, body: j.body } : null;
  } catch {
    return null;
  }
}
