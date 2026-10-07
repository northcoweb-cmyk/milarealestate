import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-ai-"));
process.env.MILA_DATA_DIR = dir;
process.env.OPENAI_API_KEY = "sk-test"; process.env.AI_PROVIDER = "openai"; delete process.env.ANTHROPIC_API_KEY;
(globalThis as any).__milaNow = new Date("2026-10-03T14:00:00Z");
const calls: any[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  if (!String(url).includes("api.openai.com")) return realFetch(url, init);
  const body = JSON.parse(init.body); calls.push(body);
  const responses = String(url).endsWith("/responses"); // GPT-6 models use the Responses API
  const fn = body.tool_choice?.function?.name ?? body.tool_choice?.name;
  const args = fn === "route" ? { intent: "general" } : { reply: "Don't counter emotionally. Anchor to the comps, ask for their reasoning, and set a response deadline.", actions: [{ label: "Draft the counter email", prompt: "Draft a counter email for the Hendersons" }, { label: "", prompt: "x" }] };
  if (responses) return new Response(JSON.stringify({ status: "completed", output: [{ type: "function_call", name: fn, arguments: JSON.stringify(args) }], usage: { input_tokens: 10, output_tokens: 10 } }), { headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ function: { name: fn, arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { headers: { "content-type": "application/json" } });
}) as typeof fetch;

const { createTestStore } = await import("../src/lib/db/store.ts");
const store: any = createTestStore(dir, true);
const { createProfile } = await import("../src/lib/users.ts");
const { handleTurn } = await import("../src/lib/agent/engine.ts");

const prof = await createProfile({ email: "ai@test.dev", full_name: "Ava Agent" });
await store.update("profiles", prof.id, prof.id, { timezone: "America/New_York", location: "Rockville, MD", onboarded: true });
const profile = await store.get("profiles", prof.id, prof.id);
await store.insert("properties", prof.id, { address: "8814 Brookside Drive", city: "Rockville", state: "MD", zip: "20850", county: null, list_price: 875000, beds: 4, baths: 3, sqft: 2400, listing_url: null, description: null, verified: true, is_demo: false });

test("open questions get an expert reply grounded in the agent's own business, with action buttons", async () => {
  const r = await handleTurn(profile, { message: "A buyer's agent just lowballed me on Brookside, how do I handle it?" });
  assert.match(r.milaMessage.content, /Anchor to the comps/);
  const choice = r.milaMessage.blocks.find((b: any) => b.type === "choice") as any;
  assert.equal(choice.buttons.length, 1, "blank suggestions are dropped");
  assert.equal(choice.buttons[0].action.text, "Draft a counter email for the Hendersons");
  const chat = calls.find((c) => (c.tool_choice?.function?.name ?? c.tool_choice?.name) === "reply");
  const system = (chat.instructions ?? chat.messages[0].content) as string;
  assert.match(system, /8814 Brookside Drive/, "knows the agent's listings");
  assert.match(system, /THINK AHEAD/);
  assert.match(system, /Fair housing|FAIR HOUSING/);
});
