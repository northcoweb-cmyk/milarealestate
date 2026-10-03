import test from "node:test";
import assert from "node:assert/strict";
const { newAgent, blocks, store } = await import("./qa/harness.mts");
const now = new Date("2026-10-03T14:00:00Z"); // Sat 10:00 ET

test("an unrelated request is never swallowed by an open question", async () => {
  const a = await newAgent({ now, tz: "America/New_York" });
  assert.match((await a.say("Schedule an inspection for Friday")).milaMessage.content, /What time on Friday/);
  const r = await a.say("Remind me to call Dana");
  assert.doesNotMatch(r.milaMessage.content, /What time on Friday/);
  assert.match(r.milaMessage.content, /remind/i);
});

test("a bare time right after booking changes that event", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await a.say("Showing at 456 Oak Lane tomorrow at 3 PM");
  const r = await a.say("Actually make that 4");
  assert.match(r.milaMessage.content, /Moved to Sunday at 4:00 PM/);
  const ev = (await store.list("calendar_events", a.id)).filter((e: any) => /456 Oak/.test(e.title));
  assert.equal(ev.length, 1);
});

test("time off is blocked and conflicts are called out", async () => {
  const a = await newAgent({ now, tz: "America/New_York" });
  const r = await a.say("I'm out of town tomorrow");
  assert.match(r.milaMessage.content, /Blocked Sunday as out of office/);
  assert.ok((await store.list("calendar_events", a.id)).some((e: any) => e.title === "Out of office"));
});

test("two events in one message become two events", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await a.say("Book a showing at 11am and another at 2pm");
  const ev = (await store.list("calendar_events", a.id)).filter((e: any) => e.kind === "showing");
  assert.equal(ev.length, 2);
});

test("telling Mila about a client saves it and flags a contradiction", async () => {
  const a = await newAgent({ now, tz: "America/New_York" });
  const r = await a.say("Michael is pre-approved for 600k and wants a yard");
  assert.match(r.milaMessage.content, /Saved to Michael's profile/);
  assert.ok(blocks(r, "choice").some((b: any) => /seller/.test(b.body ?? "")));
});
