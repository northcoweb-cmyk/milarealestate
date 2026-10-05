// "I'm listing 1231 Main Street next Thursday. Get me ready." / "What am I missing?" - operational memory for a listing.
import test from "node:test";
import assert from "node:assert/strict";

const { newAgent, blocks, store } = await import("./qa/harness.mts");
const now = new Date("2026-10-05T14:00:00Z"); // Monday
const tz = "America/New_York";

const itemsOf = (r: any) => blocks(r, "listing_brief")[0].sections.flatMap((s: any) => s.items) as { text: string; state: string; gap?: string; button?: any }[];

test("'I'm listing … Get me ready' saves the listing, dates it, starts the checklist and drafts the announcement for approval", async () => {
  const a = await newAgent({ now, tz });
  const r = await a.say("I'm listing 8814 Brookside Drive, Rockville MD, 4 bed 3 bath $875,000 next Thursday. Sellers are the Hendersons. Get me ready.");
  const [p] = (await store.list("properties", a.id)).filter((x: any) => /Brookside/.test(x.address));
  assert.ok(p, "listing saved");
  const mem = (await store.list("memories", a.id)).find((m: any) => m.subject_id === p.id && m.key === "Listing date");
  assert.equal(mem?.value, "2026-10-15", "next Thursday (same reading as the calendar)");
  const ev = (await store.list("calendar_events", a.id)).find((e: any) => e.property_id === p.id);
  assert.match(ev.title, /Listing goes live/);
  assert.ok((await store.list("tasks", a.id)).filter((t: any) => t.property_id === p.id).length >= 5, "listing checklist started");
  const post = (await store.list("social_posts", a.id)).find((x: any) => x.property_id === p.id);
  assert.ok(post && post.status === "draft" && post.category === "just_listed", "Instagram announcement drafted, not posted");
  assert.equal(blocks(r, "listing_brief").length, 1);
  const items = itemsOf(r);
  assert.ok(items.some((i) => i.state === "done" && /Hendersons/.test(i.text)), "seller known");
  assert.ok(items.some((i) => i.state === "done" && /Goes live Thursday, Oct 15/.test(i.text)), "date known");
  assert.ok(items.some((i) => i.state === "done" && /Instagram announcement/.test(i.text)));
  for (const gap of [/Listing agreement/, /photographer/i, /open house/i]) assert.ok(items.some((i) => i.state === "missing" && gap.test(i.text)), `missing: ${gap}`);
  assert.ok(items.filter((i) => i.state === "missing").every((i) => i.button), "every gap has a button that fixes it");
  assert.ok(!/RentCast|Zillow|API/i.test(r.milaMessage.content + JSON.stringify(blocks(r, "listing_brief"))), "no vendor names");
});

test("'What am I missing?' says it plainly, and shrinks as things get done", async () => {
  const a = await newAgent({ now, tz });
  await a.say("I'm listing 8814 Brookside Drive, Rockville MD, 4 bed 3 bath $875,000 next Thursday. Sellers are the Hendersons. Get me ready.");
  const r = await a.say("What am I missing?");
  assert.match(r.milaMessage.content, /hasn't been uploaded/);
  assert.match(r.milaMessage.content, /haven't scheduled the photographer/);
  assert.match(r.milaMessage.content, /open house scheduled/);
  assert.ok(!/Instagram announcement|saved the seller/.test(r.milaMessage.content), "done things aren't listed as missing");
  const before = itemsOf(r).length;

  const [p] = (await store.list("properties", a.id)).filter((x: any) => /Brookside/.test(x.address));
  await store.insert("documents", a.id, { name: "Listing Agreement - Henderson.pdf", kind: "pdf", mime: "application/pdf", size_bytes: 1, storage_path: "x", text_content: null, extracted: null, property_id: p.id, contact_id: null, summary: null });
  await store.insert("calendar_events", a.id, { title: "Photographer — 8814 Brookside Drive", kind: "other", start_at: "2026-10-06T14:00:00Z", end_at: "2026-10-06T15:00:00Z", location: null, property_id: p.id, contact_id: null, status: "confirmed", source: "mila", external_id: null, synced_at: null, workflow_run_id: null, notes: null });
  const r2 = await a.say("what's missing for 8814 Brookside Drive");
  assert.ok(!/photographer|hasn't been uploaded/.test(r2.milaMessage.content), r2.milaMessage.content);
  assert.match(r2.milaMessage.content, /open house/);
  assert.ok(itemsOf(r2).length < before);
});

test("Ready-for-approval on Home names each draft for what it is", async () => {
  const a = await newAgent({ now, tz });
  await a.say("I'm listing 8814 Brookside Drive, Rockville MD next Thursday. Get me ready.");
  const { buildFeed } = await import("../src/lib/feed.ts");
  const { buildCtx } = await import("../src/lib/agent/engine.ts");
  const feed = await buildFeed(await buildCtx(a.profile));
  const item = feed.needsYou.find((n) => n.label === "Post");
  assert.ok(item && /Instagram announcement · 8814 Brookside Drive/.test(item.title), JSON.stringify(feed.needsYou.map((n) => [n.label, n.title])));
});

test("intent routing: listing-ready and what-am-I-missing don't steal normal requests", async () => {
  const { detectIntent } = await import("../src/lib/agent/intents.ts");
  assert.equal(detectIntent("I'm listing 1231 Main Street next Thursday. Get me ready.").intent, "listing_ready");
  assert.equal(detectIntent("what am I missing?").intent, "what_missing");
  assert.equal(detectIntent("am I ready for Thursday").intent, "what_missing");
  assert.notEqual(detectIntent("what's left on my calendar today").intent, "what_missing");
  assert.notEqual(detectIntent("new listing at 12 Oak St, $650k").intent, "listing_ready");
  assert.notEqual(detectIntent("write an instagram post, I'm listing 12 Oak St").intent, "listing_ready");
});
