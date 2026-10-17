// Audit P0-10 / P0-11: unconfirmed facts never reach a public post, and the agent's instruction note never becomes caption text.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { buildCtx } from "../src/lib/agent/engine.ts";
import { createPosts } from "../src/lib/content/service.ts";

test("the note guides the post but is never pasted into it, and unconfirmed facts stay out", async () => {
  const a = await newAgent({ now: new Date("2026-10-16T15:00:00Z"), tz: "America/New_York", seed: false });
  const ctx = await buildCtx(a.profile);
  const note = "QA TEST - market update post for Gaithersburg. I have not given you any market stats, so do not make any up.";
  const m: any = await createPosts(ctx, { category: "market_update" as never, platforms: ["instagram"], topic: note });
  assert.ok(m.ok, m.error);
  assert.ok(!/QA TEST|do not make any up|not given you/i.test(m.posts[0].caption), m.posts[0].caption);
  const prop = await store.insert("properties", a.id, { address: "412 Pine Road", city: "Gaithersburg", state: "MD", zip: "20877", county: null, list_price: 480000, beds: 3, baths: 2, sqft: 1800, listing_url: null, description: null, verified: false, is_demo: false } as never);
  const j: any = await createPosts(ctx, { category: "just_listed" as never, platforms: ["instagram"], propertyId: prop.id, topic: "Use only facts on the record" });
  assert.ok(j.ok, j.error);
  const all = j.posts[0].caption + JSON.stringify(j.posts[0].slides);
  assert.ok(!/480,000|3 bd|2 ba|1,800/.test(all), all);
  await store.update("properties", a.id, prop.id, { verified: true } as never);
  const k: any = await createPosts(ctx, { category: "just_listed" as never, platforms: ["instagram"], propertyId: prop.id });
  assert.ok(/\$480,000/.test(k.posts[0].caption), "confirming the facts turns them on");
});
