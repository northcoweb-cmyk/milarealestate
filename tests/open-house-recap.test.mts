import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { BANK } from "./eval/question-bank.mts";

test("an open house that already happened today is recognized, never re-booked or asked for an address", async () => {
  const a = await newAgent({ now: new Date("2026-10-11T20:30:00Z"), tz: "America/New_York", seed: false });
  await store.insert("calendar_events", a.id, { title: "Open house at 12 Elm St", kind: "open_house", start_at: "2026-10-11T17:00:00Z", end_at: "2026-10-11T19:00:00Z", location: "12 Elm St", status: "confirmed", source: "mila" } as never);
  const before = (await store.list("calendar_events", a.id)).length;
  const r1 = await a.say("My open house went good today anything I need to know for this week");
  assert.match(r1.milaMessage.content, /12 Elm St/);
  assert.doesNotMatch(r1.milaMessage.content, /which property|street address/i);
  const r2 = await a.say("What time does it start on Sunday?");
  assert.match(r2.milaMessage.content, /Open house at 12 Elm St/);
  const r3 = await a.say("The one that happened today");
  assert.doesNotMatch(r3.milaMessage.content, /not sure how to do that|couldn't make that out/i);
  assert.equal((await store.list("calendar_events", a.id)).length, before, "nothing was added to the calendar");
});

test("question bank: real agent phrasings never hit the dead-end menu", async () => {
  const a = await newAgent({ now: new Date("2026-10-11T20:30:00Z"), tz: "America/New_York" });
  const bad: string[] = [];
  for (const q of BANK) {
    const r = await a.say(q);
    if (/not sure how to do that yet|couldn't make that out|I don't want to keep asking/i.test(r.milaMessage.content)) bad.push(q);
  }
  assert.deepEqual(bad, []);
});
