/**
 * AI provider abstraction. The agent never talks to a vendor directly: it asks
 * for a *tier* (fast / standard / reasoning / vision / research) and this
 * layer picks the cheapest capable model. Swap or add vendors by implementing
 * `AIProvider`.
 *
 * With no API key configured, `available()` is false and callers fall back to
 * the deterministic local engine, so the app is fully usable without paid
 * services (with reduced understanding of free-form requests).
 */

import { assertAiBudget, MAX_INPUT_CHARS, MAX_OUTPUT_TOKENS, noteAiSpend, tierForPlan } from "./budget";

export type Tier = "fast" | "standard" | "reasoning" | "vision" | "research";

export interface ModelInfo {
  provider: string;
  model: string;
  /** USD per 1M tokens — estimates used only for the internal cost ledger. */
  inPerM: number;
  outPerM: number;
}

export interface CompletionRequest {
  tier: Tier;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  /** Ask the model to return JSON matching this tool-style schema. */
  jsonSchema?: { name: string; description: string; schema: Record<string, unknown> };
  images?: { mediaType: string; dataBase64: string }[];
  documents?: { mediaType: "application/pdf"; dataBase64: string }[];
  webSearch?: boolean;
  /** How hard a reasoning model should think. Defaults by tier. Ignored by models that don't reason. */
  effort?: "none" | "low" | "medium" | "high";
  /** Data tools the model may call (GPT-6 Responses API only). `runFunction` executes one and returns something JSON-serialisable. */
  functions?: { name: string; description: string; parameters: Record<string, unknown> }[];
  runFunction?: (name: string, args: any) => Promise<unknown>;
  maxToolRounds?: number;
}

export interface CompletionResult {
  text: string;
  json?: unknown;
  citations?: { title: string; url: string }[];
  usage: { inputTokens: number; outputTokens: number };
  /** extra USD not captured by tokens (e.g. per-search tool fees) */
  extraCostUsd?: number;
  info: ModelInfo;
}

export interface AIProvider {
  id: string;
  available(): boolean;
  modelFor(tier: Tier): ModelInfo;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

// Model ids and prices are env-overridable: prices change, and the ledger is
// only as good as these numbers. Update them when your provider changes rates.
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(+v) ? +v : d);

export function anthropicModels(): Record<Tier, ModelInfo> {
  const fast = { provider: "anthropic", model: process.env.MILA_MODEL_FAST || "claude-haiku-4-5-20251001", inPerM: num(process.env.MILA_PRICE_FAST_IN, 1), outPerM: num(process.env.MILA_PRICE_FAST_OUT, 5) };
  const standard = { provider: "anthropic", model: process.env.MILA_MODEL_STANDARD || "claude-sonnet-5-5", inPerM: num(process.env.MILA_PRICE_STANDARD_IN, 3), outPerM: num(process.env.MILA_PRICE_STANDARD_OUT, 15) };
  const reasoning = { provider: "anthropic", model: process.env.MILA_MODEL_REASONING || "claude-opus-5-5", inPerM: num(process.env.MILA_PRICE_REASONING_IN, 5), outPerM: num(process.env.MILA_PRICE_REASONING_OUT, 25) };
  return { fast, standard, reasoning, vision: standard, research: standard };
}

class AnthropicProvider implements AIProvider {
  id = "anthropic";
  private models = anthropicModels();

  available() { return Boolean(process.env.ANTHROPIC_API_KEY); }
  modelFor(tier: Tier) { return this.models[tier]; }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const info = this.modelFor(req.tier);
    const content = (m: CompletionRequest["messages"][number], isLast: boolean) => {
      if (!isLast || m.role !== "user" || (!req.images?.length && !req.documents?.length)) return m.content;
      return [
        ...(req.images ?? []).map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.dataBase64 } })),
        ...(req.documents ?? []).map((d) => ({ type: "document", source: { type: "base64", media_type: d.mediaType, data: d.dataBase64 } })),
        { type: "text", text: m.content },
      ];
    };
    const body: Record<string, unknown> = {
      model: info.model,
      max_tokens: req.maxTokens ?? 1024,
      system: req.system,
      messages: req.messages.map((m, i) => ({ role: m.role, content: content(m, i === req.messages.length - 1) })),
    };
    const tools: unknown[] = [];
    if (req.jsonSchema) {
      tools.push({ name: req.jsonSchema.name, description: req.jsonSchema.description, input_schema: req.jsonSchema.schema });
      body.tool_choice = { type: "tool", name: req.jsonSchema.name };
    }
    if (req.webSearch) tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 5 });
    if (tools.length) body.tools = tools;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`AI provider error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      content: { type: string; text?: string; input?: unknown; citations?: { title?: string; url?: string }[] }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    let text = "";
    let json: unknown;
    const cites = new Map<string, string>();
    for (const c of data.content ?? []) {
      if (c.type === "text") {
        text += c.text ?? "";
        for (const ci of c.citations ?? []) if (ci.url) cites.set(ci.url, ci.title ?? ci.url);
      }
      if (c.type === "tool_use" && req.jsonSchema) json = c.input;
    }
    return {
      text,
      json,
      citations: [...cites].map(([url, title]) => ({ title, url })),
      usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
      extraCostUsd: req.webSearch ? num(process.env.MILA_WEBSEARCH_FEE_USD, 0.03) : 0,
      info,
    };
  }
}

// ---------------------------------------------------------------- OpenAI
// GPT-6 family: Luna (fastest, cheapest), Sol 6.1 (balanced), Astra (smartest). Override any of them with the MILA_OPENAI_MODEL_* variables,
// e.g. set all three to gpt-6-astra to use the smartest model for everything (costs far more).
export function openaiModels(): Record<Tier, ModelInfo> {
  const m = (model: string, inD: number, outD: number, envIn: string, envOut: string): ModelInfo => ({ provider: "openai", model, inPerM: num(process.env[envIn], inD), outPerM: num(process.env[envOut], outD) });
  const fastId = process.env.MILA_OPENAI_MODEL_FAST || "gpt-6-luna";
  const stdId = process.env.MILA_OPENAI_MODEL_STANDARD || "gpt-6.1-sol";
  const reasonId = process.env.MILA_OPENAI_MODEL_REASONING || "gpt-6-astra";
  // per-model list prices (USD per 1M tokens), used only for the internal cost ledger and spend guards
  const price = (id: string): [number, number] => (/astra/i.test(id) ? [10, 50] : /sol/i.test(id) ? [2, 10] : /luna/i.test(id) ? [0.1, 0.5] : /mini/i.test(id) ? [0.15, 0.6] : [2.5, 10]);
  const [fi, fo] = price(fastId), [si, so] = price(stdId), [ri, ro] = price(reasonId);
  const fast = m(fastId, fi, fo, "MILA_PRICE_FAST_IN", "MILA_PRICE_FAST_OUT");
  const standard = m(stdId, si, so, "MILA_PRICE_STANDARD_IN", "MILA_PRICE_STANDARD_OUT");
  const reasoning = m(reasonId, ri, ro, "MILA_PRICE_REASONING_IN", "MILA_PRICE_REASONING_OUT");
  return { fast, standard, reasoning, vision: standard, research: standard };
}

/** If a GPT-6 model can't be used (not enabled on the key, wrong name), fall back to these so the product keeps working. */
const LEGACY: Record<Tier, [string, number, number]> = { fast: ["gpt-4o-mini", 0.15, 0.6], standard: ["gpt-4o", 2.5, 10], reasoning: ["gpt-4o", 2.5, 10], vision: ["gpt-4o", 2.5, 10], research: ["gpt-4o", 2.5, 10] };
const isGpt6 = (model: string) => /^gpt-6/i.test(model) || process.env.MILA_OPENAI_API === "responses";
const DEFAULT_EFFORT: Record<Tier, "none" | "low" | "medium" | "high"> = { fast: "none", standard: "low", reasoning: "medium", vision: "low", research: "low" };

class OpenAIProvider implements AIProvider {
  id = "openai";
  private models = openaiModels();
  available() { return Boolean(process.env.OPENAI_API_KEY); }
  modelFor(tier: Tier) { return this.models[tier]; }

  private async post(path: string, body: unknown) {
    const res = await fetch(`${(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")}/${path}`, {
      method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(path === "responses" ? 120_000 : 90_000),
    });
    if (!res.ok) throw new Error(`AI provider error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json() as Promise<any>;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const info = this.modelFor(req.tier);
    if (!isGpt6(info.model)) return this.viaChat(req, info);
    try {
      return await this.viaResponses(req, info);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // only a model that can't be used (unknown, no access) triggers the fallback; real errors still surface
      if (!/\b(404|403)\b|model_not_found|does not exist|do not have access|not have access|unsupported model|invalid model/i.test(msg) || process.env.MILA_OPENAI_FALLBACK === "0") throw e;
      console.warn(`[ai] ${info.model} unavailable (${msg.slice(0, 160)}); using ${LEGACY[req.tier][0]}`);
      const [id, i, o] = LEGACY[req.tier];
      return this.viaChat(req, { provider: "openai", model: id, inPerM: i, outPerM: o });
    }
  }

  /** GPT-6 models: the Responses API (required for tools), with a reasoning-effort setting. */
  private async viaResponses(req: CompletionRequest, info: ModelInfo): Promise<CompletionResult> {
    const effort = req.effort ?? DEFAULT_EFFORT[req.tier];
    const input = req.messages.map((m, i) => {
      const last = i === req.messages.length - 1;
      if (last && m.role === "user" && (req.images?.length || req.documents?.length)) {
        return { role: "user", content: [
          { type: "input_text", text: m.content },
          ...(req.images ?? []).map((im) => ({ type: "input_image", image_url: `data:${im.mediaType};base64,${im.dataBase64}` })),
          ...(req.documents ?? []).map((dc) => ({ type: "input_file", filename: "document.pdf", file_data: `data:${dc.mediaType};base64,${dc.dataBase64}` })),
        ] };
      }
      return { role: m.role, content: m.content };
    });
    const tools: any[] = [];
    const maxTokens = (req.maxTokens ?? 1500) + ({ none: 0, low: 600, medium: 2500, high: 5000 } as const)[effort]; // thinking tokens count against the limit, so leave room for them
    const body: Record<string, unknown> = { model: info.model, instructions: req.system, input, reasoning: { effort }, max_output_tokens: maxTokens };
    if (req.jsonSchema) tools.push({ type: "function", name: req.jsonSchema.name, description: req.jsonSchema.description, parameters: req.jsonSchema.schema, strict: false });
    for (const f of req.functions ?? []) tools.push({ type: "function", name: f.name, description: f.description, parameters: f.parameters, strict: false });
    if (req.jsonSchema) body.tool_choice = req.webSearch || req.functions?.length ? "auto" : { type: "function", name: req.jsonSchema.name };
    if (req.webSearch) tools.push({ type: "web_search" });
    if (tools.length) body.tools = tools;
    let d: any;
    try { d = await this.post("responses", body); }
    catch (e) {
      // older accounts name the search tool differently
      if (req.webSearch && /web_search|tool/i.test(String(e))) { tools[tools.length - 1] = { type: "web_search_preview" }; d = await this.post("responses", { ...body, tools }); }
      else throw e;
    }
    let text = ""; let json: unknown; const cites = new Map<string, string>(); let inTok = 0, outTok = 0;
    const harvest = (resp: any) => {
      inTok += resp.usage?.input_tokens ?? 0; outTok += resp.usage?.output_tokens ?? 0; // output includes the model's thinking tokens
      text = ""; // the final answer is the last response's message
      for (const o of resp.output ?? []) {
        if (o.type === "message") for (const c of o.content ?? []) {
          if (c.type === "output_text") { text += c.text ?? ""; for (const a of c.annotations ?? []) if (a.type === "url_citation" && a.url) cites.set(a.url, a.title ?? a.url); }
        } else if (o.type === "function_call" && req.jsonSchema && o.name === req.jsonSchema.name) {
          try { json = JSON.parse(o.arguments); } catch { /* leave undefined */ }
        }
      }
    };
    harvest(d);
    // Tool loop: run the data tools the model asked for, hand the results back, repeat (bounded).
    const own = (resp: any) => (resp.output ?? []).filter((o: any) => o.type === "function_call" && (!req.jsonSchema || o.name !== req.jsonSchema.name));
    const maxRounds = Math.min(req.maxToolRounds ?? 5, 8);
    for (let round = 0; req.runFunction && own(d).length && d.id; round++) {
      const pending = own(d);
      const last = round >= maxRounds;
      if (!last) await assertAiBudget({ tier: req.tier, inputChars: 4000, webSearch: req.webSearch }); // each extra round is paid for: re-check the allowance
      const outputs = await Promise.all(pending.map(async (c: any) => {
        let out: unknown;
        if (last) out = { error: "Tool limit reached. Answer now with what you already have, and list what you could not check." };
        else { try { out = await req.runFunction!(c.name, JSON.parse(c.arguments || "{}")); } catch (e) { out = { error: e instanceof Error ? e.message : String(e) }; } }
        return { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(out ?? null).slice(0, 14000) };
      }));
      d = await this.post("responses", { model: info.model, instructions: req.system, previous_response_id: d.id, input: outputs, reasoning: { effort }, max_output_tokens: maxTokens, tools, tool_choice: last ? "none" : "auto" });
      harvest(d);
      if (last) break;
    }
    if (!text && json === undefined && d.status === "incomplete") throw new Error(`AI provider error: the answer was cut off (${d.incomplete_details?.reason ?? "incomplete"}); raise MILA_MAX_OUTPUT_TOKENS or lower the effort`);
    return {
      text, json, citations: [...cites].map(([url, title]) => ({ title, url })),
      usage: { inputTokens: inTok, outputTokens: outTok },
      extraCostUsd: req.webSearch ? num(process.env.MILA_WEBSEARCH_FEE_USD, 0.03) : 0, info,
    };
  }

  /** Older models (gpt-4o and friends): Chat Completions. */
  private async viaChat(req: CompletionRequest, info: ModelInfo): Promise<CompletionResult> {
    // Live web search goes through the Responses API.
    if (req.webSearch) {
      const d = await this.post("responses", {
        model: info.model, instructions: req.system, max_output_tokens: req.maxTokens ?? 1500,
        input: req.messages.map((m) => ({ role: m.role, content: m.content })), tools: [{ type: "web_search_preview" }],
      });
      let text = ""; const cites = new Map<string, string>();
      for (const o of d.output ?? []) if (o.type === "message") for (const c of o.content ?? []) {
        if (c.type === "output_text") { text += c.text ?? ""; for (const a of c.annotations ?? []) if (a.type === "url_citation" && a.url) cites.set(a.url, a.title ?? a.url); }
      }
      return { text, citations: [...cites].map(([url, title]) => ({ title, url })), usage: { inputTokens: d.usage?.input_tokens ?? 0, outputTokens: d.usage?.output_tokens ?? 0 }, extraCostUsd: num(process.env.MILA_WEBSEARCH_FEE_USD, 0.03), info };
    }
    const msgs: any[] = [{ role: "system", content: req.system }];
    req.messages.forEach((m, i) => {
      const last = i === req.messages.length - 1;
      if (last && m.role === "user" && (req.images?.length || req.documents?.length)) {
        msgs.push({ role: "user", content: [
          { type: "text", text: m.content },
          ...(req.images ?? []).map((im) => ({ type: "image_url", image_url: { url: `data:${im.mediaType};base64,${im.dataBase64}` } })),
          ...(req.documents ?? []).map((dc) => ({ type: "file", file: { filename: "document.pdf", file_data: `data:${dc.mediaType};base64,${dc.dataBase64}` } })),
        ] });
      } else msgs.push({ role: m.role, content: m.content });
    });
    const body: Record<string, unknown> = { model: info.model, messages: msgs, max_completion_tokens: req.maxTokens ?? 1024 };
    if (req.jsonSchema) {
      body.tools = [{ type: "function", function: { name: req.jsonSchema.name, description: req.jsonSchema.description, parameters: req.jsonSchema.schema } }];
      body.tool_choice = { type: "function", function: { name: req.jsonSchema.name } };
    }
    const d = await this.post("chat/completions", body);
    const msg = d.choices?.[0]?.message ?? {};
    let json: unknown;
    const args = msg.tool_calls?.[0]?.function?.arguments;
    if (args) { try { json = JSON.parse(args); } catch { /* leave undefined */ } }
    return { text: msg.content ?? "", json, usage: { inputTokens: d.usage?.prompt_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0 }, info };
  }
}

/**
 * Every model call in the product goes through this wrapper: it trims oversized requests, refuses the call when the person's (or the
 * product's) AI budget is spent, and meters the cost of what it did run. See ./budget.ts.
 */
class GuardedProvider implements AIProvider {
  constructor(private inner: AIProvider) {}
  get id() { return this.inner.id; }
  available() { return this.inner.available(); }
  modelFor(tier: Tier) { return this.inner.modelFor(tier); }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    // 1) size limits: output tokens, total input text, attachments
    const maxIn = MAX_INPUT_CHARS();
    let budgetLeft = maxIn;
    const messages = [...req.messages].reverse().map((m) => { const c = m.content.slice(0, Math.max(0, budgetLeft)); budgetLeft -= c.length; return { ...m, content: c }; }).reverse().filter((m, i) => m.content || i === req.messages.length - 1);
    const guarded: CompletionRequest = { ...req, messages, system: req.system.slice(0, maxIn), maxTokens: Math.min(req.maxTokens ?? 1024, req.tier === "reasoning" ? Math.max(MAX_OUTPUT_TOKENS(), 6000) : MAX_OUTPUT_TOKENS()), images: req.images?.slice(0, 3), documents: req.documents?.slice(0, 2) };
    // 1b) plan quality: Standard runs hard questions on the standard model (thinking harder), Premium gets the top model
    const q = await tierForPlan(req.tier, req.effort);
    if (q.tier !== req.tier) { guarded.tier = q.tier; guarded.effort = q.effort as CompletionRequest["effort"]; guarded.maxTokens = Math.min(req.maxTokens ?? 1024, MAX_OUTPUT_TOKENS()); }
    // 2) spend limits (throws AiBudgetError; callers already fall back to the rule-based engine)
    await assertAiBudget({ tier: guarded.tier, inputChars: guarded.system.length + messages.reduce((n, m) => n + m.content.length, 0), webSearch: req.webSearch });
    const r = await this.inner.complete(guarded);
    noteAiSpend(estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) + (r.extraCostUsd ?? 0));
    return r;
  }
}

/** Provider choice: AI_PROVIDER=openai|anthropic forces one; otherwise whichever API key is present (Anthropic first). */
let provider: AIProvider | null = null;
export function getProvider(): AIProvider {
  if (provider) return provider;
  const pref = (process.env.AI_PROVIDER ?? "").toLowerCase();
  const a = new AnthropicProvider(), o = new OpenAIProvider();
  provider = new GuardedProvider(pref === "openai" ? o : pref === "anthropic" ? a : a.available() ? a : o.available() ? o : a);
  return provider;
}
export function aiAvailable() { return getProvider().available(); }
export function aiProviderName(): string | null { const p = getProvider(); return p.available() ? p.id : null; }

export function estimateCost(info: ModelInfo, inTok: number, outTok: number) {
  return (inTok * info.inPerM + outTok * info.outPerM) / 1_000_000;
}

/** Image generation is intentionally not wired up yet — social slides are rendered as designed
 *  typography cards, which costs nothing. The seam is here for when it's worth the money. */
export interface ImageProvider { id: string; available(): boolean; generate(prompt: string): Promise<{ url: string; costUsd: number }> }
export const imageProvider: ImageProvider | null = null;
