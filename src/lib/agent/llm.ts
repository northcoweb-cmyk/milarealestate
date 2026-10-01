import { aiAvailable, estimateCost, getProvider } from "../ai/provider";
import { recordUsage } from "../credits";
import type { Ctx } from "./context";
import { listMemories } from "./memory";
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

export async function llmChat(ctx: Ctx, text: string, history: { role: "user" | "assistant"; content: string }[]): Promise<string | null> {
  if (!aiAvailable()) return null;
  try {
    const mem = (await listMemories(ctx, { scope: "user" })).slice(0, 8).map((m) => `- ${m.key}: ${m.value}`).join("\n");
    const r = await getProvider().complete({
      tier: text.length > 280 || /\b(plan|strategy|analy[sz]e|compare|negotiat|why|explain)\b/i.test(text) ? "standard" : "fast", maxTokens: 700,
      system: `You are Mila, a personal work assistant for ${ctx.profile.full_name}, a US real-estate agent (${ctx.profile.location || "location not set"}; ${ctx.profile.experience} agent; focus: ${ctx.profile.business_type}). Be warm, concise and practical. Never fabricate MLS data, listing facts, prices or statistics. Real-estate law, tax, disclosure and licensing rules vary by state/locality: when relevant, say so and suggest verifying with their broker, state real-estate commission or a licensed attorney/CPA instead of stating them as certain. You can't take actions in this reply; if the user wants something done (calendar, contacts, emails, tasks), tell them to ask plainly and you'll do it. What you know about the user:\n${mem || "(nothing saved yet)"}`,
      messages: [...history.slice(-6), { role: "user", content: text }],
    });
    ctx.usage.aiCalls++;
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: "chat", creditKey: "chat_simple", creditsOverride: 0, tier: "fast", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) });
    return r.text.trim() || null;
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
