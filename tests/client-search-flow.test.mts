import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-search-"));
const env = process.env as Record<string, string | undefined>;
env.MILA_DATA_DIR = dir; delete env.ANTHROPIC_API_KEY;

const seen: any[] = [];
const answer = { bottom_line: "Maryland itself fits best: recreational cannabis is legal with open stores, and Baltimore's harbor neighborhoods have luxury high-rises near $2,500 for a one-bedroom. Philadelphia and Richmond do not allow retail recreational sales.", requirements: [{ item: "Recreational cannabis legal", kind: "hard" }, { item: "Rent under $2,500", kind: "hard" }, { item: "Balcony", kind: "soft" }],
  conflicts: ["Floor-to-ceiling windows plus luxury amenities usually cost more than $2,500 in New Jersey and New York."], shortlist: [{ name: "Harbor East, Baltimore", where: "Baltimore, MD", why: "Walkable, new towers with balconies.", fit: "✔ cannabis · ✔ budget · ? tours", rent: "$2,100 to $2,600 for a one-bedroom", risk: "Check the building's night-time walk route." }],
  unverified: ["Current availability in specific buildings"], next: [{ label: "Email the shortlist", prompt: "Draft an email to my clients with this shortlist" }], question: null };
const srv = http.createServer((req, res) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
  const body = JSON.parse(raw || "{}"); seen.push(body);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(answer), annotations: [{ type: "url_citation", url: "https://example.com/md-cannabis", title: "Maryland cannabis law" }] }] }], usage: { input_tokens: 1200, output_tokens: 900 } }));
}); });
await new Promise<void>((ok) => srv.listen(0, ok));
Object.assign(env, { OPENAI_API_KEY: "sk-test", AI_PROVIDER: "openai", OPENAI_BASE_URL: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, MILA_AI_KILL: "" });

const { createTestStore } = await import("../src/lib/db/store.ts");
const store: any = createTestStore(dir, true);
const { createProfile } = await import("../src/lib/users.ts");
const { handleTurn } = await import("../src/lib/agent/engine.ts");
const p = await createProfile({ email: "agent@realty.com", full_name: "Agent Smith" });
await store.update("profiles", p.id, p.id, { onboarded: true, timezone: "America/New_York" });

const BRIEF = `I have some clients that are looking to get an apartment. Here’s what they want find the best properties for them: 🌿 Recreational weed legally available * 🛡️ Actually comfortable walking at night * 🏙️ Upscale/young/urban * 🪟 Floor-to-ceiling windows * 🌆 Balcony * ⭐ Strong resident reviews * 🏊 Luxury amenities * 🎥 Actual 3D/virtual tour * 💰 ≤ $2,500 * 🚗/✈️ Within roughly 4–5 hours of Maryland`;

test("a client brief gets researched with the smartest model, not turned into a showing", async () => {
  await handleTurn(p, { message: "I have a new buyer named Aisha Rahman looking for a 3 bedroom townhome in Gaithersburg around $560k in the next 6 weeks" });
  seen.length = 0;
  const before = (await store.list("calendar_events", p.id)).length;
  const t = await handleTurn(p, { message: BRIEF });
  assert.equal((await store.list("calendar_events", p.id)).length, before, "no calendar event created");
  assert.match(t.milaMessage.content, /Maryland itself fits best/);
  const kinds = t.milaMessage.blocks.map((b: any) => b.type);
  assert.ok(kinds.includes("market") && kinds.includes("choice") && kinds.includes("notice"), kinds.join());
  const market: any = t.milaMessage.blocks.find((b: any) => b.type === "market");
  assert.equal(market.sources[0].url, "https://example.com/md-cannabis");
  const call = seen.at(-1);
  assert.equal(call.model, "gpt-6-astra"); assert.equal(call.reasoning.effort, "medium");
  assert.ok(call.tools.some((x: any) => x.type === "web_search"));
  assert.ok(!/Aisha|Gaithersburg/.test(JSON.stringify(call.input)), "does not mix in another client");
});

test("'search for the specified criteria' continues THAT search instead of grabbing another client", async () => {
  seen.length = 0;
  const t = await handleTurn(p, { message: "Look for apartments with specified criteria" });
  assert.match(t.milaMessage.content, /Maryland itself fits best/);
  assert.ok(JSON.stringify(seen.at(-1).input).includes("Within roughly 4–5 hours of Maryland"), "the earlier brief was used");
  assert.ok(!/Aisha|townhome/.test(t.milaMessage.content));
});

test.after(() => srv.close());
