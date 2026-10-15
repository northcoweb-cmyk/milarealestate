// Approving a post marks it Ready to post. Mila never says "automatic posting isn't available".
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { buildCtx } from "../src/lib/agent/engine.ts";
import { TOOLS } from "../src/lib/agent/tools.ts";

test("approving a social post succeeds and marks it ready, with no automatic-posting message", async () => {
  const a = await newAgent({ now: new Date("2026-10-15T15:00:00Z"), tz: "America/New_York", seed: false });
  const post = await store.insert("social_posts", a.id, { platform: "instagram", caption: "Open house Sunday", hashtags: [], slides: [], status: "pending_approval", property_id: null } as never);
  const ctx = await buildCtx(a.profile);
  const r = await TOOLS.publish_social_post.run(ctx, { postId: post.id });
  assert.equal(r.ok, true);
  assert.equal((await store.get("social_posts", a.id, post.id))!.status, "approved_unpublished");
  assert.ok(!/automatic posting/i.test(JSON.stringify(r)));
});
