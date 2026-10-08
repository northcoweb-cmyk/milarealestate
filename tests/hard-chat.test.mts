// Hard, realistic agent messages (real-style addresses, typos, pronouns, two requests in one) found by manual testing.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, blocks, store } from "./qa/harness.mts";

const now = new Date("2026-10-08T14:00:00Z");
const tz = "America/New_York";
const fresh = () => newAgent({ now, tz, seed: false });
const say = async (a: any, m: string) => (await a.say(m)).milaMessage.content as string;

test("'Text Dana I'm running late' texts Dana, not someone called 'Text'", async () => {
  const out = await say(await fresh(), "Text Dana I'm running 10 min late");
  assert.match(out, /text to Dana/);
  assert.match(out, /Hi Dana, I'm running 10 min late/);
});

test("'Text her that…' goes to the client we were just talking about, not a street name in the message", async () => {
  const a = await fresh();
  await say(a, "I have a new buyer Maria Gonzales, 301-555-0188, wants a 3 bed");
  const out = await say(a, "Text her that I have a showing Saturday at 11 at 9 Elm Court Rockville");
  assert.match(out, /text to Maria/);
  assert.match(out, /Hi Maria, I have a showing Saturday at 11/);
});

test("telling someone a showing moved is a message, not a calendar change", async () => {
  const a = await fresh();
  await say(a, "I have a new buyer Maria Gonzales, 301-555-0188, wants a 3 bed");
  const before = (await store.list("calendar_events", a.id)).length;
  const out = await say(a, "text Maria the showing moved to 4");
  assert.match(out, /text to Maria/);
  assert.equal((await store.list("calendar_events", a.id)).length, before);
});

test("two bookings in one sentence become two events on the right days", async () => {
  const a = await fresh();
  await say(a, "lunch with Priya wed noon and showing at 99 Oak Ave Germantown thu 530pm");
  const evs = await store.list("calendar_events", a.id);
  assert.equal(evs.length, 2);
  assert.ok(evs.some((e: any) => /Lunch/i.test(e.title) && new Date(e.start_at).toISOString() === "2026-10-14T16:00:00.000Z"));
  assert.ok(evs.some((e: any) => /Showing/i.test(e.title) && new Date(e.start_at).toISOString() === "2026-10-08T21:30:00.000Z"));
});

test("a listing appointment is a calendar event, not a new listing", async () => {
  const a = await fresh();
  const out = await say(a, "Put me down for a listing appointment with the Hendersons at 22 Birch St Frederick Tuesday at 6pm");
  assert.match(out, /Added: .*22 Birch Street, Tuesday • 6:00 PM/);
  assert.equal((await store.list("properties", a.id)).length, 0);
});

test("'What did I just schedule?' answers with the last thing added", async () => {
  const a = await fresh();
  await say(a, "Open house at 14 Chestnut Ln Bethesda MD 20814 this Sunday 1-3pm");
  assert.match(await say(a, "What did I just schedule?"), /14 Chestnut Lane, Sunday/);
});

test("'add michelle as a lead already comeon' updates Michelle Turner, it does not invent a person called 'Already Comeon'", async () => {
  const a = await fresh();
  await say(a, "I have a new buyer named Michelle Turner");
  const out = await say(a, "add michelle as a lead already comeon");
  assert.match(out, /Michelle Turner is now a lead/);
  const people = await store.list("contacts", a.id);
  assert.equal(people.length, 1);
  assert.doesNotMatch(people.map((p: any) => p.name).join(), /already|comeon/i);
});

import { plausibleName } from "../src/lib/agent/nlu.ts";
import { plainText } from "../src/lib/agent/plain.ts";

test("rookie-mistake guards: junk is never a person, tool tags never reach the screen, sends are honest", async () => {
  for (const bad of ["i already told you...", "Already Comeon", "poop", "what's the lead's name", "", "a b c d e f"]) assert.equal(plausibleName(bad), false, bad);
  for (const good of ["Michelle Turner", "Dana Whitfield", "Anne-Marie Dubois", "Sean O'Malley", "Dr. Patel".replace(".", "")]) assert.equal(plausibleName(good), true, good);
  assert.doesNotMatch(plainText("Want me to draft it?</reply>\n</invoke>"), /<|>/);
  // with no mailbox connected, approving an email must say nothing was sent
  const a = await fresh();
  await say(a, "I have a new buyer named Dana Whitfield, dana@example.com");
  const out = await say(a, "email Dana about the showing on Friday");
  assert.doesNotMatch(out, /\bsent\b(?! the)/i);
});
