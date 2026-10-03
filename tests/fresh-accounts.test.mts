import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-fresh-"));
process.env.MILA_DATA_DIR = dir;
(globalThis as any).__milaNow = new Date("2026-10-01T13:00:00Z");
const { createTestStore } = await import("../src/lib/db/store");
const store = createTestStore(dir);
const { createProfile } = await import("../src/lib/users");
const { seedDemoData } = await import("../src/lib/db/seed");
const { isNoDemo, purgeDemoData } = await import("../src/lib/fresh-accounts");

async function account(email: string) {
  const prof = await createProfile({ email, full_name: "Test Agent" });
  await store.update("profiles", prof.id, prof.id, { timezone: "America/New_York", onboarded: true });
  const p = (await store.get("profiles", prof.id, prof.id))!;
  await seedDemoData(p);
  return p;
}
const counts = async (id: string) => Object.fromEntries(await Promise.all(["contacts", "properties", "calendar_events", "tasks", "approvals", "email_drafts", "memories", "document_templates"].map(async (t) => [t, (await store.list(t as never, id)).length])));

test("the listed login is recognised case-insensitively", () => {
  assert.ok(isNoDemo("sarahpark0506@gmail.com"));
  assert.ok(isNoDemo("  SarahPark0506@Gmail.com "));
  assert.ok(!isNoDemo("someone@else.com"));
});

test("an account with only sample data is wiped completely", async () => {
  const p = await account("sarahpark0506@gmail.com");
  assert.ok((await counts(p.id)).contacts > 5);
  const n = await purgeDemoData(store, p.id);
  assert.ok(n > 20);
  const c = await counts(p.id);
  for (const [t, v] of Object.entries(c)) assert.equal(v, 0, `${t} should be empty`);
  assert.equal(await purgeDemoData(store, p.id), 0, "running it again changes nothing");
});

test("real records are kept when they are mixed in with sample data", async () => {
  const p = await account("mixed@test.dev");
  const real = await store.insert("contacts", p.id, { name: "Real Person", email: "real@client.com", phone: null, type: "buyer", status: "new", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: "Manual", importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#222" } as never);
  await purgeDemoData(store, p.id);
  const left = await store.list("contacts", p.id);
  assert.deepEqual(left.map((c) => c.id), [real.id]);
  assert.equal((await store.list("properties", p.id)).length, 0);
});

const { deleteProperty, propertyUsage } = await import("../src/lib/property-delete");
test("deleting a property removes everything made for it, and nothing else", async () => {
  const p = await account("del@test.dev");
  const props = await store.list("properties", p.id);
  const target = props.find((x) => x.address === "123 Main Street")!;
  const other = props.find((x) => x.address === "456 Oak Lane")!;
  const before = await propertyUsage(store, p.id, target.id);
  assert.ok(before.events >= 1, "the demo has a showing at 123 Main Street");
  const otherBefore = await propertyUsage(store, p.id, other.id);
  const n = await deleteProperty(store, p.id, target.id);
  assert.ok(n >= 2);
  assert.equal((await store.list("properties", p.id)).some((x) => x.id === target.id), false);
  assert.deepEqual(await propertyUsage(store, p.id, target.id), { events: 0, tasks: 0, drafts: 0, posts: 0, sheets: 0, photos: 0 });
  assert.deepEqual(await propertyUsage(store, p.id, other.id), otherBefore, "other properties are untouched");
});
