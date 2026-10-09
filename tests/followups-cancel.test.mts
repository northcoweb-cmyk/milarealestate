// Follow-ups: only people who really need one this week, each with buttons. Cancelling offers to tell the client.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, blocks } from "./qa/harness.mts";

const mk = () => newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });

test("someone added a minute ago does not need a follow-up", async () => {
  const a = await mk();
  await a.say("Add a seller named Tom Alvarez, tom.alvarez@example.com, 512-555-0142. He's listing his home next month.");
  const r = await a.say("Who should I follow up with today?");
  assert.doesNotMatch(JSON.stringify(r.milaMessage), /Tom Alvarez/);
});

test("cancelling a showing offers to email or text the client to reschedule", async () => {
  const a = await mk();
  await a.say("New buyer Dana Reyes, dana@example.com, 512-555-0199, wants a condo downtown under $500k");
  await a.say("Showing with Dana Reyes at 710 W Cesar Chavez St, Austin, TX 78701 tomorrow at 2pm");
  const r = await a.say("Cancel the Dana showing");
  const txt = JSON.stringify(r.milaMessage);
  assert.match(txt, /Confirm cancel/);
  assert.match(txt, /Email Dana to reschedule/);
  assert.match(txt, /Text Dana to reschedule/);
});
