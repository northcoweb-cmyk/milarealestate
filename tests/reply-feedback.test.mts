// "How was this? Useful / Missing something / Wrong" is kept quietly and read back into Mila's prompt.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent } from "./qa/harness.mts";
import { getStore } from "../src/lib/db/store.ts";
import { feedbackLessons, recordReplyFeedback } from "../src/lib/agent/reply-feedback.ts";
import { listMemories } from "../src/lib/agent/memory.ts";

test("ratings become hidden lessons, newest rating wins, nothing shows in the Memory screen", async () => {
  const a = await newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });
  const store = getStore();
  const r = await a.say("What do I have today?");
  const id = r.milaMessage.id as string;
  await recordReplyFeedback(store, a.id, { kind: "wrong", messageId: id, note: "I have a showing at 3", snippet: null });
  let lessons = await feedbackLessons(store, a.id);
  assert.match(lessons, /WRONG/);
  assert.match(lessons, /What do I have today/);
  assert.match(lessons, /I have a showing at 3/);
  await recordReplyFeedback(store, a.id, { kind: "useful", messageId: id, note: null, snippet: null });
  lessons = await feedbackLessons(store, a.id);
  assert.match(lessons, /USEFUL/);
  assert.doesNotMatch(lessons, /WRONG/);
  const visible = await listMemories({ store, userId: a.id } as never);
  assert.ok(!visible.some((m) => m.key.startsWith("cache:reply_feedback:")));
});

test("nothing rated means nothing added to the prompt", async () => {
  const a = await newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });
  assert.equal(await feedbackLessons(getStore(), a.id), "");
});
