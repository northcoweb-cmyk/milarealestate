// Audit P0-05 / P1-01: the whole typed name is kept, greetings use the real first name, and "call Tuesday" means Tuesday.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { firstNameOf } from "../src/lib/names.ts";
import { parsePersonName } from "../src/lib/agent/nlu.ts";

test("first names skip titles and ALL-CAPS tags but keep a single initial-style name", () => {
  assert.equal(firstNameOf("QA TEST Jordan Lee"), "Jordan");
  assert.equal(firstNameOf("Dr. Sam Okafor"), "Sam");
  assert.equal(firstNameOf("AJ Lee"), "AJ");
  assert.equal(firstNameOf("Mary Jane Watson-Parker"), "Mary");
  assert.equal(firstNameOf("Dana"), "Dana");
});

test("names with tags and titles are parsed whole", () => {
  assert.equal(parsePersonName("Add a new lead named QA TEST Jordan Lee, looking for a 3 bed under 600k, call Tuesday"), "QA TEST Jordan Lee");
  assert.equal(parsePersonName("I have a new buyer named Dr. Sam Okafor looking for a condo"), "Dr. Sam Okafor");
  assert.equal(parsePersonName("new buyer named Dana Whitfield Tuesday"), "Dana Whitfield");
});

test("a new lead keeps the full name, greets by first name and schedules the call on the named day", async () => {
  const a = await newAgent({ now: new Date("2026-10-16T22:00:00Z"), tz: "America/New_York", seed: false });
  await a.say("Add a new lead named QA TEST Jordan Lee, looking for a 3 bed under 600k, call Tuesday");
  assert.deepEqual((await store.list("contacts", a.id)).map((c) => c.name), ["QA TEST Jordan Lee"]);
  const t = (await store.list("tasks", a.id)).find((x) => /Intro call/.test(x.title))!;
  assert.equal(t.title, "Intro call with Jordan");
  assert.equal(t.due_at!.slice(0, 10), "2026-10-20");
});
