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
}

export interface CompletionResult {
  text: string;
  json?: unknown;
  citations?: { title: string; url: string }[];
  usage: { inputTokens: number; outputTokens: number };
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
      info,
    };
  }
}

let provider: AIProvider | null = null;
export function getProvider(): AIProvider {
  return (provider ??= new AnthropicProvider());
}
export function aiAvailable() { return getProvider().available(); }

export function estimateCost(info: ModelInfo, inTok: number, outTok: number) {
  return (inTok * info.inPerM + outTok * info.outPerM) / 1_000_000;
}

/** Image generation is intentionally not wired up yet — social slides are rendered as designed
 *  typography cards, which costs nothing. The seam is here for when it's worth the money. */
export interface ImageProvider { id: string; available(): boolean; generate(prompt: string): Promise<{ url: string; costUsd: number }> }
export const imageProvider: ImageProvider | null = null;
