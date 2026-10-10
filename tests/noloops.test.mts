// Mila must never ask the same question twice in a row, whatever the agent answers.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const now = new Date("2026-10-05T14:00:00Z");
const tz = "America/New_York";
const setLoc = async (a: any, loc: string) => { await store.update("profiles", a.id, a.id, { location: loc, primary_market: "" }); a.profile.location = loc; a.profile.primary_market = ""; };
// talk to the engine directly: the QA harness auto-answers "what city" questions, which would hide exactly what is being tested here
const { handleTurn } = await import("../src/lib/agent/engine.ts");
const say = async (a: any, m: string) => { (globalThis as any).__milaNow = now; return (await handleTurn(a.profile, { message: m })).milaMessage.content as string; };
const asksCity = (t: string) => /what city is/i.test(t);

test("a profile location of just a city is enough: no question at all", async () => {
  const a = await newAgent({ now, tz, seed: false });
  await setLoc(a, "Gaithersburg");
  const out = await say(a, "Prep for 1231 Main Street");
  assert.ok(!asksCity(out), out);
  assert.match(out, /1231 Main Street/);
  const [p] = await store.list("properties", a.id);
  assert.equal(p.city, "Gaithersburg");
});

test("with no home market she asks once, and a bare city (any case, with or without the state) answers it", async () => {
  for (const reply of ["Gaithersburg", "gaithersburg", "gaithersburg md", "Gaithersburg, MD", "20877"]) {
    const a = await newAgent({ now, tz, seed: false });
    await setLoc(a, "");
    const q = await say(a, "Prep for 1231 Main Street");
    assert.ok(asksCity(q), `first asks: ${q}`);
    const out = await say(a, reply);
    assert.ok(!asksCity(out), `"${reply}" was not accepted: ${out}`);
    const [p] = await store.list("properties", a.id);
    assert.ok(p, `no property after "${reply}"`);
    if (/^\d+$/.test(reply)) assert.equal(p.zip, reply); else assert.equal(p.city, "Gaithersburg");
  }
});

test("an unreadable answer never gets the question again: she carries on with the address, flagged unverified", async () => {
  const a = await newAgent({ now, tz, seed: false });
  await setLoc(a, "");
  assert.ok(asksCity(await say(a, "I have an open house at 910 Pine Road Sunday at 2 PM")));
  const out = await say(a, "zzzz 123 qqq");
  assert.ok(!asksCity(out), out);
  assert.match(out, /prepared your open house/i);
});

test("the open-house, listing and transaction flows all take a bare-city answer", async () => {
  for (const [first, re] of [["New listing at 14 Birch Lane. $725,000", / is saved/], ["Offer accepted on 14 Birch Lane, closing November 20", /built the timeline/]] as const) {
    const a = await newAgent({ now, tz, seed: false });
    await setLoc(a, "");
    const q = await say(a, first);
    assert.ok(asksCity(q) || re.test(q), q);
    if (asksCity(q)) { const out = await say(a, "Frederick"); assert.ok(!asksCity(out), out); assert.match(out, re); }
  }
});

test("any other question that comes straight back is dropped with one clear instruction (no pending state left)", async () => {
  const a = await newAgent({ now, tz, seed: false });
  assert.match(await say(a, "Schedule an inspection for Friday"), /what time on friday/i);
  const out = await say(a, "banana");
  assert.doesNotMatch(out, /what time on friday/i);
  assert.match(out, /don't want to keep asking, so I haven't changed anything/);
  // and the next message starts fresh
  assert.match(await say(a, "Inspection Friday at 10 AM"), /Added/);
});

test("FUZZ: no incomplete request, answered with junk, ever gets the same question twice in a row", async () => {
  const starters = [
    "I have an open house at 910 Pine Road", "I have an open house at 910 Pine Road Sunday", "Open house Sunday at 2 PM", "Showing at 456 Oak Lane on Sunday", "Schedule an inspection for Friday",
    "Book a closing Thursday", "Remind me to call Dana", "Remind me tomorrow", "Email the Hendersons about the price drop", "Text Dana", "Draft an email", "New listing", "I listed a house on Maple Avenue",
    "Offer accepted on 14 Birch Lane", "We're under contract", "I closed on a house", "Log a call", "Prep for 1231 Main Street", "Prep", "I'm out of town", "Move my showing", "Cancel my meeting",
    "Dana Whitfield just called", "Add a buyer", "Find homes for", "Send my sphere an announcement",
  ];
  const replies = ["banana", "ok", "?", "yes", "no", "123", "asdf qwer zxcv tyui", "idk", "whatever you think"];
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const bad: string[] = [];
  for (const starter of starters) for (const reply of replies) {
    const a = await newAgent({ now, tz, seed: false });
    const seen: string[] = [];
    for (const m of [starter, reply, reply, reply]) {
      const out = norm(await say(a, m));
      if (seen.length && out === seen[seen.length - 1] && /\?\s*$|what|which|who/.test(out)) bad.push(`"${starter}" → "${reply}" repeated: ${out.slice(0, 90)}`);
      seen.push(out);
    }
  }
  assert.deepEqual(bad.slice(0, 15), [], `${bad.length} repeated questions`);
});
