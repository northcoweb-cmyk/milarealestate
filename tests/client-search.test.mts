import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
const env = process.env as Record<string, string | undefined>;
const { detectIntent, isClientSearch } = await import("../src/lib/agent/intents");
const { parseTime } = await import("../src/lib/agent/nlu");

const BRIEF = `I have some clients that are looking to get an apartment. Here’s what they want find the best properties for them: 🌿 Recreational weed legally available * 🛡️ Actually comfortable walking at night * 🏙️ Upscale/young/urban * 🪟 Floor-to-ceiling windows * 🌆 Balcony * ⭐ Strong resident reviews * 🏊 Luxury amenities * 🎥 Actual 3D/virtual tour * 💰 ≤ $2,500 * 🚗/✈️ Within roughly 4–5 hours of Maryland`;

test("a multi-requirement client brief is a search job, not a calendar event", () => {
  assert.equal(detectIntent(BRIEF).intent, "client_search");
  assert.equal(parseTime(BRIEF), null); // "4–5 hours" is a drive time, not 4 to 5 PM
  assert.equal(parseTime("It's about 2-3 hours away"), null);
  assert.equal(parseTime("showing 4-5 pm")?.start.h, 16);
  assert.equal(parseTime("lunch 1-3 pm")?.end?.h, 15);
});

test("other requests are not swallowed by the search router", () => {
  for (const t of ["Showing at 456 Oak Lane Sunday at 3 PM", "Find something for Aisha", "I have an open house at 123 Main Street Sunday at 1 PM. Set everything up.", "Who do I need to follow up with today?", "I have a new buyer named Sarah looking for a 3 bedroom house around $650k in Montgomery County in the next 3 months."]) {
    assert.notEqual(detectIntent(t).intent, "client_search", t);
  }
  assert.equal(isClientSearch("Show me 123 Main Street, 3 bed, balcony, parking, under $500k, walkable, schools, must have garage, find me comps for my clients looking to buy a home"), false); // has a street address
});

function mock(handler: (body: any, url: string) => { status: number; json: unknown }) {
  const seen: { url: string; body: any }[] = [];
  const srv = http.createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {}; seen.push({ url: req.url ?? "", body });
      const r = handler(body, req.url ?? ""); res.statusCode = r.status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(r.json));
    });
  });
  return new Promise<{ base: string; seen: typeof seen; close: () => void }>((ok) => srv.listen(0, () => ok({ base: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, seen, close: () => srv.close() })));
}

test("GPT-6 models are called through the Responses API with a reasoning effort and a forced function", async () => {
  const m = await mock(() => ({ status: 200, json: { status: "completed", output: [{ type: "function_call", name: "route", arguments: JSON.stringify({ intent: "general" }) }], usage: { input_tokens: 100, output_tokens: 20 } } }));
  Object.assign(env, { OPENAI_API_KEY: "sk-test", AI_PROVIDER: "openai", OPENAI_BASE_URL: m.base, NODE_ENV: "test" });
  const { getProvider } = await import("../src/lib/ai/provider");
  const p = getProvider();
  assert.equal(p.modelFor("reasoning").model, "gpt-6-astra"); assert.equal(p.modelFor("standard").model, "gpt-6.1-sol"); assert.equal(p.modelFor("fast").model, "gpt-6-luna");
  assert.equal(p.modelFor("reasoning").outPerM, 50); assert.equal(p.modelFor("fast").inPerM, 0.1);
  const r = await p.complete({ tier: "reasoning", effort: "high", system: "s", messages: [{ role: "user", content: "hi" }], jsonSchema: { name: "route", description: "d", schema: { type: "object" } } });
  assert.deepEqual(r.json, { intent: "general" });
  const call = m.seen.at(-1)!;
  assert.equal(call.url, "/v1/responses"); assert.equal(call.body.model, "gpt-6-astra"); assert.equal(call.body.reasoning.effort, "high");
  assert.deepEqual(call.body.tool_choice, { type: "function", name: "route" }); assert.equal(call.body.tools[0].type, "function"); assert.equal("temperature" in call.body, false);
  assert.ok(call.body.max_output_tokens > 1024); // room left for thinking tokens
  m.close();
});

test("web search and citations come back from the Responses API", async () => {
  const m = await mock(() => ({ status: 200, json: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{\"bottom_line\":\"ok\"}", annotations: [{ type: "url_citation", url: "https://example.com/a", title: "A" }] }] }], usage: { input_tokens: 10, output_tokens: 5 } } }));
  env.OPENAI_BASE_URL = m.base;
  const { getProvider } = await import("../src/lib/ai/provider");
  const r = await getProvider().complete({ tier: "reasoning", system: "s", messages: [{ role: "user", content: "x" }], webSearch: true });
  assert.equal(r.citations?.[0].url, "https://example.com/a");
  assert.ok(m.seen.at(-1)!.body.tools.some((t: any) => t.type === "web_search"));
  m.close();
});

test("a GPT-6 model the account can't use falls back to the older models instead of failing", async () => {
  const m = await mock((b) => b.model?.startsWith("gpt-6")
    ? { status: 404, json: { error: { message: "The model `gpt-6-astra` does not exist or you do not have access to it.", code: "model_not_found" } } }
    : { status: 200, json: { choices: [{ message: { content: "fallback ok" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } } });
  env.OPENAI_BASE_URL = m.base;
  const { getProvider } = await import("../src/lib/ai/provider");
  const r = await getProvider().complete({ tier: "reasoning", system: "s", messages: [{ role: "user", content: "x" }] });
  assert.equal(r.text, "fallback ok"); assert.equal(r.info.model, "gpt-4o");
  assert.deepEqual(m.seen.map((x) => x.url), ["/v1/responses", "/v1/chat/completions"]);
  m.close();
});
