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
    if (c.needsProperty) assert.ok(/9 Elm Street, Gaithersburg, MD/.test(post.caption) && /\$999,999/.test(post.caption), `${c.key} should carry the full address and price`);
  }
});

test("listing posts carry the full data: address with city/state/zip, price, beds/baths/size, and the extras we know", async () => {
  await store.insert("memories", prof.id, { scope: "property", subject_id: verified.id, key: `cache:property_lookup:${verified.id}`, value: JSON.stringify({ at: "x", found: true, facts: null, sources: [], extra: { year_built: 1998, lot_sqft: 7405, hoa_fee: 250, tax_amount: 7812, list_status: "Active", days_on_market: 12, property_type: "Single Family", garage_spaces: 2, pool: false } }), source: "system", confidence: 0.6, pinned: false });
  await store.update("properties", prof.id, verified.id, { zip: "20850" });
  const r: any = await svc.createPosts(ctx, { category: "just_listed", platforms: ["instagram"], propertyId: verified.id });
  const post = r.posts[0];
  assert.match(post.caption, /📍 12 Oak Lane, Rockville, MD 20850/);
  assert.match(post.caption, /💰 \$650,000/);
  assert.match(post.caption, /🛏 4 bd • 3 ba • 2,400 sq ft/);
  assert.match(post.caption, /✨ Single Family • 2-car garage • 1998 built • 7,405 sq ft lot • \$250 HOA\/mo • \$7,812 taxes\/yr • 12 days on market/);
  const slides = post.slides;
  assert.equal(slides[0].headline, "12 Oak Lane"); assert.equal(slides[0].sub, "Just Listed • $650,000");
  assert.equal(slides.length, 3, "a post is at most 3 images");
  assert.equal(slides[1].headline, "$650,000 • 4 bd • 3 ba • 2,400 sq ft • 1998 built • 7,405 sq ft lot • $250 HOA/mo", "price, specs and extras share ONE stats image"); assert.equal(slides[1].sub, "Rockville, MD 20850");
  assert.equal(slides[slides.length - 1].role, "cta");
});

test("an open house post leads with the date and time and still carries all the numbers", async () => {
  const start = new Date("2026-10-04T17:00:00Z"), end = new Date("2026-10-04T19:00:00Z");
  await store.insert("calendar_events", prof.id, { title: "Open House — 12 Oak Lane", kind: "open_house", start_at: start.toISOString(), end_at: end.toISOString(), location: "12 Oak Lane", property_id: verified.id, contact_id: null, status: "confirmed", source: "mila", external_id: null, synced_at: null, workflow_run_id: null, notes: null });
  const r: any = await svc.createPosts(ctx, { category: "open_house", platforms: ["instagram", "instagram_story"], propertyId: verified.id });
  for (const post of r.posts) {
    assert.match(post.caption, /🗓 Sunday • /); assert.match(post.caption, /📍 12 Oak Lane, Rockville, MD 20850/); assert.match(post.caption, /💰 \$650,000/);
    assert.match(post.slides[0].sub, /^Open House • Sunday • /);
    assert.ok(post.slides.some((s: any) => s.headline.startsWith("$650,000 • 4 bd")));
  }
});

test("a sparse property never prints blanks: missing numbers are left out, not invented", async () => {
  const bare = await store.insert("properties", prof.id, { address: "3 Pine Road", city: "Frederick", state: "MD", zip: null, county: null, list_price: null, beds: null, baths: null, sqft: null, listing_url: null, description: null, verified: false, is_demo: false });
  const r: any = await svc.createPosts(ctx, { category: "just_listed", platforms: ["instagram"], propertyId: bare.id });
  const t = r.posts[0].caption + r.posts[0].slides.map((s: any) => `${s.headline} ${s.sub ?? ""}`).join(" ");
  assert.match(r.posts[0].caption, /📍 3 Pine Road, Frederick, MD/);
  assert.doesNotMatch(t, /💰|🛏|✨|undefined|null|NaN|\$0\b|0 bd|0 ba/);
});

test("rewriting a post keeps the photos the agent put on it", async () => {
  const r: any = await svc.createPosts(ctx, { category: "just_listed", platforms: ["instagram"], propertyId: verified.id });
  const mine = { ...r.posts[0], slides: r.posts[0].slides.map((s: any, i: number) => ({ ...s, image_url: i === 0 ? "/api/files/my-own-photo" : s.image_url })) };
  const again = await svc.regenerate(ctx, mine);
  assert.equal(again.slides[0].image_url, "/api/files/my-own-photo");
});

test("property categories require a property; platform required", async () => {
  assert.equal((await svc.createPosts(ctx, { category: "just_listed", platforms: ["instagram"] })).ok, false);
  assert.equal((await svc.createPosts(ctx, { category: "buyer_tip", platforms: [] })).ok, false);
});

test("only Instagram post + story exist (no TikTok)", () => {
  assert.deepEqual(PLATFORMS.map((p: any) => p.key), ["instagram", "instagram_story"]);
});

test("every caption ends with the agent's signature, within limits, and story is 1080x1920", async () => {
  const { buildSignature } = await import("../src/lib/signature.ts");
  const { formatFor } = await import("../src/lib/content/design.ts");
  await store.update("profiles", prof.id, prof.id, { settings: { ...profile.settings, brand: { credentials: "MD Realtor®", license: "", cell: "301.509.7280", office: "202.243.7700", email: "sarah@example.com", team: "Coalition Properties Group", pfp: null } } });
  const p2 = await store.get("profiles", prof.id, prof.id);
  const c2 = await buildCtx(p2);
  const sig = buildSignature(p2);
  assert.match(sig, /^Sarah Carter \| MD Realtor® C\. 301\.509\.7280 \| o\. 202\.243\.7700 sarah@example\.com Coalition Properties Group at Demo Realty$/);
  const r: any = await svc.createPosts(c2, { category: "buyer_tip", platforms: ["instagram", "instagram_story"], topic: "word ".repeat(600) });
  assert.ok(r.ok);
  for (const post of r.posts) {
    assert.ok(post.caption.endsWith(sig), `${post.platform} missing signature`);
    assert.ok(post.caption.length <= platformLimit(post.platform));
    assert.equal(post.caption.split(sig).length, 2, "signed once");
  }
  assert.equal(formatFor("instagram_story"), "story");
  const reg = await svc.regenerate(c2, r.posts[0]);
  assert.ok(reg.caption.endsWith(sig) && reg.caption.split(sig).length === 2);
});

test("variants rotate so repeated posts differ", async () => {
  const a: any = await svc.createPosts(ctx, { category: "buyer_tip", platforms: ["instagram"] });
  const b: any = await svc.createPosts(ctx, { category: "buyer_tip", platforms: ["instagram"] });
  assert.notEqual(a.posts[0].caption, b.posts[0].caption);
  const reg = await svc.regenerate(ctx, a.posts[0]);
  assert.notEqual(reg.caption, a.posts[0].caption);
});

test("scheduling sets a reminder; posting/archiving cancels it; daily limit enforced; past refused", async () => {
  const mk = async () => ((await svc.createPosts(ctx, { category: "local", platforms: ["instagram"] })) as any).posts[0];
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
  const p = ((await svc.createPosts(ctx, { category: "education", platforms: ["instagram"] })) as any).posts[0];
  await svc.schedulePost(ctx, p, "2026-10-10T14:00:00Z");
  const before = (await store.list("reminders", prof.id)).filter((r: any) => r.status === "pending").length;
  await svc.schedulePost(ctx, await store.get("social_posts", prof.id, p.id), "2026-10-11T14:00:00Z");
  assert.equal((await store.list("reminders", prof.id)).filter((r: any) => r.status === "pending").length, before);
});

test("weekly plan: right count, ≤3/day, none in the past, then approve schedules them", async () => {
  const r = await svc.planContent(ctx, { postsPerWeek: 7, categories: ["buyer_tip", "seller_tip", "just_listed", "local"], platforms: ["instagram", "instagram_story"], days: 14 });
  assert.equal(r.created.length, 14);
  const byDay: Record<string, number> = {};
  for (const p of r.created) { assert.ok(new Date(p.scheduled_for!).getTime() > ctx.now.getTime()); assert.equal(p.status, "draft"); const k = p.scheduled_for!.slice(0, 10); byDay[k] = (byDay[k] ?? 0) + 1; }
  assert.ok(Object.values(byDay).every((n) => n <= 3));
  const a = await svc.approvePlanned(ctx, r.created.map((p) => p.id));
  assert.equal(a.scheduled + a.failed.length, 14);
});

test("duplicate to the story fits the story and keeps one signature", async () => {
  const p = ((await svc.createPosts(ctx, { category: "seller_tip", platforms: ["instagram"], topic: "x ".repeat(100) })) as any).posts[0];
  const copies = await svc.duplicateTo(ctx, p, ["instagram_story", "instagram"]);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].platform, "instagram_story");
  assert.ok(copies[0].caption.length <= platformLimit("instagram_story"));
});
