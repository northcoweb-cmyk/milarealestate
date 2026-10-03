import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Guards "your data is never silently dropped": every column the app writes must exist in the Supabase migrations.
 * (If a column were missing, the store would quietly leave that field out instead of saving it.)
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-schema-"));
process.env.MILA_DATA_DIR = dir;
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.GOOGLE_MAPS_API_KEY;
(globalThis as any).__milaNow = new Date("2026-10-01T13:00:00Z");
const { createTestStore } = await import("../src/lib/db/store");
const store: any = createTestStore(dir);
const seen: Record<string, Set<string>> = {};
const note = (t: string, o: object) => { (seen[t] ??= new Set()); Object.keys(o).forEach((k) => seen[t].add(k)); };
const oi = store.insert.bind(store), ou = store.update.bind(store);
store.insert = async (t: string, u: string, d: any) => { const r = await oi(t, u, d); note(t, r); return r; };
store.update = async (t: string, u: string, id: string, p: any) => { note(t, p); return ou(t, u, id, p); };

const { createProfile } = await import("../src/lib/users");
const { seedDemoData } = await import("../src/lib/db/seed");
const { handleTurn } = await import("../src/lib/agent/engine");
const { buildCtx } = await import("../src/lib/agent/engine");
const { createPosts, planContent, approvePlanned } = await import("../src/lib/content/service");
const { emptySheet } = await import("../src/lib/showing-sheet");
const { logError } = await import("../src/lib/server/errors");

test("every column the app writes exists in the database migrations", async () => {
  const prof = await createProfile({ email: "a@b.co", full_name: "Test Agent" });
  await store.update("profiles", prof.id, prof.id, { timezone: "America/New_York", location: "Gaithersburg, MD", onboarded: true, brokerage: "Keller Williams", settings: { ...prof.settings, brand: { credentials: "MD Realtor®", license: "", cell: "301.509.7280", office: "", email: "a@b.co", team: "Team", pfp: null }, workflows: { email_contacts: true } } });
  const p = await store.get("profiles", prof.id, prof.id);
  await seedDemoData(p);
  for (const m of ["I have an open house at 9 Elm Street, Rockville, MD Sunday at 1 PM", "I moved the open house to Saturday at 2", "I have a new buyer named Dana looking for a 3 bedroom around $650k in Frederick County", "Remind me Friday to call Dana", "Who do I need to follow up with today?", "Email my contacts about the open house at 9 Elm Street", "Schedule a showing at 456 Oak Lane on Sunday", "sorry the one for today"]) await handleTurn(p, { message: m });
  await logError({ source: "api", message: "schema probe", route: "GET /x", userId: prof.id, email: "a@b.co", detail: { a: 1 } });
  await store.update("error_logs", prof.id, (await store.listAll("error_logs"))[0].id, { status: "resolved" });
  const ctx = await buildCtx(p);
  const prop = (await store.list("properties", prof.id))[0];
  await createPosts(ctx, { category: "just_listed", platforms: ["instagram", "instagram_story"], propertyId: prop.id });
  await createPosts(ctx, { category: "buyer_tip", platforms: ["instagram"] });
  const plan = await planContent(ctx, { postsPerWeek: 3, categories: [], platforms: ["instagram"], days: 7 });
  await approvePlanned(ctx, plan.created.map((x: any) => x.id));
  // showing sheet + media records (stored as documents)
  await store.insert("documents", prof.id, { name: "Showing sheet — x", kind: "text", mime: "application/json", size_bytes: 0, storage_path: "", text_content: null, extracted: emptySheet(prop.id, new Date()), property_id: prop.id, contact_id: null, summary: null });
  await store.insert("documents", prof.id, { name: "p.jpg", kind: "image", mime: "image/jpeg", size_bytes: 10, storage_path: "x/y", text_content: null, extracted: { media: true }, property_id: prop.id, contact_id: null, summary: null });

  const sql = fs.readdirSync("supabase/migrations").sort().map((f) => fs.readFileSync(path.join("supabase/migrations", f), "utf8")).join("\n");
  const cols: Record<string, Set<string>> = {};
  for (const m of sql.matchAll(/create table if not exists (\w+) \((?:\n([\s\S]*?)\n\);|([^\n]*)\);)/g)) cols[m[1]] = new Set((m[2] ?? m[3].split(",").join("\n")).split("\n").map((l) => l.trim().split(/\s+/)[0]).filter(Boolean));
  for (const m of sql.matchAll(/alter table (\w+) add column if not exists (\w+)/g)) (cols[m[1]] ??= new Set()).add(m[2]);
  const problems: string[] = [];
  for (const [t, keys] of Object.entries(seen)) {
    if (!cols[t]) { problems.push(`no table ${t}`); continue; }
    for (const k of keys) if (!cols[t].has(k) && !(t === "profiles" && k === "user_id")) problems.push(`${t}.${k}`);
  }
  assert.deepEqual(problems, [], "these columns are written by the app but missing from supabase/migrations: " + problems.join(", "));
  assert.ok(Object.keys(seen).length >= 15, "the test should touch most tables");
});

test("hosted deploys refuse the temporary file store", async () => {
  const { ephemeralStoreBlocked } = await import("../src/lib/db/store.ts");
  const saved = { ...process.env };
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_URL; delete process.env.MILA_ALLOW_EPHEMERAL;
    process.env.VERCEL = "1";
    assert.equal(ephemeralStoreBlocked(), true);
    process.env.MILA_ALLOW_EPHEMERAL = "1";
    assert.equal(ephemeralStoreBlocked(), false);
    delete process.env.VERCEL; delete process.env.MILA_ALLOW_EPHEMERAL;
    assert.equal(ephemeralStoreBlocked(), false); // local dev still works
  } finally { process.env = saved; }
});
