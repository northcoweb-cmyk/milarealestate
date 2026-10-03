import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-admin-"));
process.env.MILA_DATA_DIR = dir;
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
const NOW = new Date(Date.now() + 2 * 86_400_000); // two days after the accounts are made, so "never came back" rules apply

const { createTestStore } = await import("../src/lib/db/store.ts");
const store: any = createTestStore(dir, true);
const { createProfile } = await import("../src/lib/users.ts");
const { logError } = await import("../src/lib/server/errors.ts");
const { buildAdminReport } = await import("../src/lib/admin-report.ts");
const { handleTurn } = await import("../src/lib/agent/engine.ts");

const mk = async (email: string, name: string, onboarded = true) => { const p = await createProfile({ email, full_name: name }); await store.update("profiles", p.id, p.id, { onboarded, timezone: "America/New_York", location: "Rockville, MD" }); return store.get("profiles", p.id, p.id); };
const ana = await mk("ana@realty.com", "Ana Reyes"), ben = await mk("ben@realty.com", "Ben Cho"), cy = await mk("cy@realty.com", "Cy Park", false), qa = await mk("qa7@test.dev", "QA Bot");

test("report counts only real accounts and shows who is active, stuck, or lost", async () => {
  await handleTurn(ana, { message: "I have a new buyer named Priya Shah looking for a 3 bedroom around $500k" });
  await handleTurn(ana, { message: "Add my listing 22 Elm Court Bethesda MD, 3/2, $650k" });
  await handleTurn(qa, { message: "hello there" });
  const r = await buildAdminReport(NOW);
  assert.equal(r.kpis.accounts, 3, "test account excluded");
  assert.equal(r.kpis.testAccounts, 1);
  assert.equal(r.kpis.onboarded, 2);
  const a = r.accounts.find((x) => x.email === "ana@realty.com")!;
  assert.deepEqual([a.messages, a.contacts, a.properties], [2, 1, 1]);
  assert.equal(r.funnel[0].n, 3); assert.equal(r.funnel[2].n, 1); assert.equal(r.funnel[3].n, 1);
  assert.ok(r.kpis.active7d >= 1);
  assert.ok(r.attention.some((x) => /never used Mila/.test(x.title) && /ben@realty.com/.test(x.detail)), "Ben signed up and never used it");
});

test("errors are grouped, attributed, resolvable, and flood-protected", async () => {
  for (let i = 0; i < 25; i++) await logError({ source: "api", message: `Boom at row ${i}`, route: "POST /api/contacts", userId: ana.id, email: ana.email });
  await logError({ source: "client", message: "x is not a function", userId: ben.id, email: ben.email });
  await logError({ source: "client", message: "x is not a function", userId: ben.id, email: ben.email });
  const r = await buildAdminReport(NOW);
  const g = r.errors.find((e) => e.source === "api")!;
  assert.ok(g.count <= 11, `flood capped, got ${g.count}`);
  assert.deepEqual(g.emails, ["ana@realty.com"]);
  assert.ok(r.accounts.find((a) => a.email === "ana@realty.com")!.errors7d > 0);
  assert.ok(r.attention.some((a) => a.severity !== "low" && /error/.test(a.title)));
  for (const l of await store.listAll("error_logs")) await store.update("error_logs", l.user_id, l.id, { status: "resolved" });
  assert.equal((await buildAdminReport(NOW)).kpis.openErrors, 0);
});

test("messages Mila did not understand are collected so they can be fixed", async () => {
  await handleTurn(ana, { message: "blorp the zibzab for flarn" });
  await handleTurn(ana, { message: "blorp the zibzab for flarn" });
  const r = await buildAdminReport(NOW);
  const u = r.unhandled.find((x) => /zibzab/.test(x.phrase))!;
  assert.equal(u.count, 2);
  assert.ok(r.kpis.unhandled7d >= 2);
});

test("health reports what is and isn't connected", async () => {
  const h = (await buildAdminReport(NOW)).health;
  assert.equal(h.ai, null); assert.equal(h.persistent, false); assert.equal(h.store, "file");
});
