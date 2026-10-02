import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-content-"));
process.env.MILA_DATA_DIR = dir;
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
(globalThis as any).__milaNow = new Date("2026-10-01T13:00:00Z"); // Thu 9:00 ET

const { createTestStore } = await import("../src/lib/db/store.ts");
const store: any = createTestStore(dir, true);
const { createProfile } = await import("../src/lib/users.ts");
const { buildCtx } = await import("../src/lib/agent/engine.ts");
const svc = await import("../src/lib/content/service.ts");
const { CATEGORIES, PLATFORMS, platformLimit } = await import("../src/lib/content/templates.ts");

const prof = await createProfile({ email: "c@test.dev", full_name: "Sarah Carter" });
await store.update("profiles", prof.id, prof.id, { timezone: "America/New_York", location: "Gaithersburg, MD", primary_market: "Montgomery County, MD", brokerage: "Demo Realty", onboarded: true });
const profile = await store.get("profiles", prof.id, prof.id);
const ctx = await buildCtx(profile);
const unverified = await store.insert("properties", prof.id, { address: "9 Elm Street", city: "Gaithersburg", state: "MD", zip: null, county: null, list_price: 999999, beds: 5, baths: 4, sqft: 4000, listing_url: null, description: null, verified: false, is_demo: false });
const verified = await store.insert("properties", prof.id, { address: "12 Oak Lane", city: "Rockville", state: "MD", zip: null, county: null, list_price: 650000, beds: 4, baths: 3, sqft: 2400, listing_url: null, description: null, verified: true, is_demo: false });

test("every category × platform builds clean, within limits, with no invented facts", async () => {
  for (const c of CATEGORIES) for (const p of PLATFORMS) {
    const r = await svc.createPosts(ctx, { category: c.key, platforms: [p.key], propertyId: c.needsProperty ? unverified.id : null });
    assert.ok(r.ok, `${c.key}/${p.key}: ${(r as any).error}`);
    const post = (r as any).posts[0];
    assert.ok(post.caption.length <= platformLimit(p.key), `${c.key}/${p.key} over limit (${post.caption.length})`);
    assert.ok(!/undefined|NaN|\[object|\{\{/.test(post.caption + JSON.stringify(post.slides)), `${c.key}/${p.key} leaks junk`);
    assert.ok(post.slides.length >= 1 && post.slides.every((s: any) => s.headline.trim()));
    if (c.needsProperty) assert.ok(!/999,?999|5 bed|4 bath|4,?000|sq ft/.test(post.caption + JSON.stringify(post.slides)), `${c.key} used unverified facts`);
  }
});

test("verified facts are used, unverified are not", async () => {
  const r: any = await svc.createPosts(ctx, { category: "just_listed", platforms: ["instagram"], propertyId: verified.id });
  assert.match(r.posts[0].caption, /4 bed/); assert.match(r.posts[0].caption, /\$650,000/);
});

test("property categories require a property; platform required", async () => {
  assert.equal((await svc.createPosts(ctx, { category: "just_listed", platforms: ["instagram"] })).ok, false);
  assert.equal((await svc.createPosts(ctx, { category: "buyer_tip", platforms: [] })).ok, false);
});

test("X posts stay ≤ 280 even with a long note", async () => {
  const r: any = await svc.createPosts(ctx, { category: "buyer_tip", platforms: ["x"], topic: "word ".repeat(120) });
  assert.ok(r.posts[0].caption.length <= 280);
});

test("variants rotate so repeated posts differ", async () => {
  const a: any = await svc.createPosts(ctx, { category: "buyer_tip", platforms: ["instagram"] });
  const b: any = await svc.createPosts(ctx, { category: "buyer_tip", platforms: ["instagram"] });
  assert.notEqual(a.posts[0].caption, b.posts[0].caption);
  const reg = await svc.regenerate(ctx, a.posts[0]);
  assert.notEqual(reg.caption, a.posts[0].caption);
});

test("scheduling sets a reminder; posting/archiving cancels it; daily limit enforced; past refused", async () => {
  const mk = async () => ((await svc.createPosts(ctx, { category: "local", platforms: ["facebook"] })) as any).posts[0];
  const day = new Date("2026-10-05T14:00:00Z");
  const posts = [await mk(), await mk(), await mk(), await mk()];
  for (let i = 0; i < 3; i++) assert.ok((await svc.schedulePost(ctx, posts[i], new Date(day.getTime() + i * 3_600_000).toISOString())).ok);
  const fourth = await svc.schedulePost(ctx, posts[3], new Date(day.getTime() + 5 * 3_600_000).toISOString());
  assert.equal(fourth.ok, false); assert.match((fourth as any).error, /daily limit/);
  assert.equal((await svc.schedulePost(ctx, posts[3], "2026-09-01T10:00:00Z")).ok, false);
  const pending = (await store.list("reminders", prof.id)).filter((r: any) => r.status === "pending");
  assert.equal(pending.length, 3);
  const cur = await store.get("social_posts", prof.id, posts[0].id);
  await svc.setPostStatus(ctx, cur, "posted");
  assert.equal((await store.list("reminders", prof.id)).filter((r: any) => r.status === "pending").length, 2);
  const p1 = await store.get("social_posts", prof.id, posts[1].id);
  await svc.deletePost(ctx, p1);
  assert.equal((await store.list("reminders", prof.id)).filter((r: any) => r.status === "pending").length, 1);
  assert.equal(await store.get("social_posts", prof.id, posts[1].id), null);
});

test("reschedule moves the reminder instead of duplicating it", async () => {
  const p = ((await svc.createPosts(ctx, { category: "education", platforms: ["linkedin"] })) as any).posts[0];
  await svc.schedulePost(ctx, p, "2026-10-10T14:00:00Z");
  const before = (await store.list("reminders", prof.id)).filter((r: any) => r.status === "pending").length;
  await svc.schedulePost(ctx, await store.get("social_posts", prof.id, p.id), "2026-10-11T14:00:00Z");
  assert.equal((await store.list("reminders", prof.id)).filter((r: any) => r.status === "pending").length, before);
});

test("weekly plan: right count, ≤3/day, none in the past, then approve schedules them", async () => {
  const r = await svc.planContent(ctx, { postsPerWeek: 7, categories: ["buyer_tip", "seller_tip", "just_listed", "local"], platforms: ["instagram", "facebook"], days: 14 });
  assert.equal(r.created.length, 14);
  const byDay: Record<string, number> = {};
  for (const p of r.created) { assert.ok(new Date(p.scheduled_for!).getTime() > ctx.now.getTime()); assert.equal(p.status, "draft"); const k = p.scheduled_for!.slice(0, 10); byDay[k] = (byDay[k] ?? 0) + 1; }
  assert.ok(Object.values(byDay).every((n) => n <= 3));
  const a = await svc.approvePlanned(ctx, r.created.map((p) => p.id));
  assert.equal(a.scheduled + a.failed.length, 14);
});

test("duplicate to another platform fits that platform", async () => {
  const p = ((await svc.createPosts(ctx, { category: "seller_tip", platforms: ["linkedin"], topic: "x ".repeat(100) })) as any).posts[0];
  const copies = await svc.duplicateTo(ctx, p, ["x", "linkedin", "instagram"]);
  assert.equal(copies.length, 2);
  assert.ok(copies.find((c) => c.platform === "x")!.caption.length <= 280);
});
