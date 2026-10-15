// Planning a post for a day puts it on that day's to-do list and sets a reminder; marking it posted completes both.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { buildCtx } from "../src/lib/agent/engine.ts";
import { schedulePost, setPostStatus } from "../src/lib/content/service.ts";

const NOW = new Date("2026-10-15T15:00:00Z");

test("a planned post becomes a to-do and a reminder; posting it checks both off", async () => {
  const a = await newAgent({ now: NOW, tz: "America/New_York", seed: false });
  const post = await store.insert("social_posts", a.id, { platform: "instagram", caption: "Open house Saturday 2 to 4", hashtags: [], slides: [], status: "draft", property_id: null, event_id: null, scheduled_for: null, stale: false, stale_reason: null, posted_at: null } as never);
  const ctx = await buildCtx(a.profile);
  const when = new Date(NOW.getTime() + 2 * 86_400_000).toISOString();
  const r = await schedulePost(ctx, post as never, when);
  assert.equal(r.ok, true);
  const tasks = (await store.list("tasks", a.id)).filter((t) => /Post to/.test(t.title));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, "open");
  assert.equal(new Date(tasks[0].due_at!).toISOString(), when);
  assert.equal((await store.list("reminders", a.id)).filter((x) => /Post to/.test(x.title) && x.status === "pending").length, 1);
  await setPostStatus(ctx, (r as { post: never }).post, "posted");
  assert.equal((await store.list("tasks", a.id)).filter((t) => /Post to/.test(t.title))[0].status, "done");
});
