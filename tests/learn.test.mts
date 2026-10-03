import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-learn-"));
process.env.MILA_DATA_DIR = dir;
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
const { createTestStore } = await import("../src/lib/db/store.ts");
const store: any = createTestStore(dir, true);
const { createProfile } = await import("../src/lib/users.ts");
const { buildCtx } = await import("../src/lib/agent/engine.ts");
const { learnFromTurn, knowledgeFor } = await import("../src/lib/agent/learn.ts");
const { listMemories } = await import("../src/lib/agent/memory.ts");

const prof = await createProfile({ email: "l@test.dev", full_name: "Lee Agent" });
const profile = await store.get("profiles", prof.id, prof.id);
const ctx = await buildCtx(profile);
const dana = await store.insert("contacts", prof.id, { name: "Dana Whitfield", email: null, phone: null, type: "buyer", status: "active", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#888", is_demo: false });

test("learns how the agent works and what clients want, without inventing", async () => {
  assert.ok((await learnFromTurn(ctx, "I mostly work in Bethesda and Chevy Chase. I prefer texting clients before noon.")) >= 2);
  assert.ok((await learnFromTurn(ctx, "Dana wants a ranch with a big yard and has two kids and a dog. She is worried about interest rates.")) >= 2);
  const mem = await listMemories(ctx);
  assert.ok(mem.some((m: any) => m.key === "Market" && /Bethesda/.test(m.value)));
  assert.ok(mem.some((m: any) => m.scope === "contact" && m.subject_id === dana.id && m.key === "Wants" && /ranch/.test(m.value)));
  assert.ok(mem.some((m: any) => m.scope === "contact" && m.key === "Family"));
});

test("questions and small talk save nothing; repeats are not duplicated", async () => {
  const before = (await listMemories(ctx)).length;
  assert.equal(await learnFromTurn(ctx, "What does Dana want in a house?"), 0);
  assert.equal(await learnFromTurn(ctx, "ok thanks that works for me"), 0);
  await learnFromTurn(ctx, "I mostly work in Bethesda and Chevy Chase.");
  assert.equal((await listMemories(ctx)).length, before);
});

test("what Mila knows reaches the model for the right client only", async () => {
  const k = await knowledgeFor(ctx, "write Dana a note");
  assert.match(k, /Bethesda/); assert.match(k, /Dana Whitfield/); assert.match(k, /ranch/);
  assert.doesNotMatch(await knowledgeFor(ctx, "hello"), /Dana Whitfield/);
});
