// The owner's real-day phone test (Chicago rentals): client, three showings, a cancel, a client who went with another agent, time off.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const NOW = new Date("2026-10-13T15:00:00Z");
async function setup() {
  const a = await newAgent({ now: NOW, tz: "America/Chicago", seed: false });
  await a.say("Add a new client Maya Brooks, 312-555-0142, maya.brooks@example.com, looking for a 1 bedroom rental in the West Loop under $2,600");
  await a.say("Book a showing at 347 W Chestnut St, Unit 2611, Chicago, IL 60610 for Maya Brooks tomorrow at 4 PM");
  await a.say("Book a showing at 765 W Adams St, Chicago, IL 60661 with Maya Brooks tomorrow at 5:15 PM");
  await a.say("Book a showing at 506 W Deming Pl, Chicago, IL 60614 with Maya Brooks Thursday at 11 AM");
  return a;
}
const maya = async (a: any) => (await store.list("contacts", a.id)).find((c: any) => c.name === "Maya Brooks");

test("a client who signed with another agent comes off the active list, nothing is deleted, her showings are offered for cancelling", async () => {
  const a = await setup();
  const r = await a.say("Maya just told me she signed with another realtor");
  assert.match(r.milaMessage.content, /off your active clients/i);
  assert.equal((await maya(a)).status, "inactive");
  assert.ok((await maya(a)).tags.includes("went with another agent"));
  const btn = JSON.stringify(r.milaMessage.blocks);
  assert.match(btn, /Cancel all my showings with Maya Brooks/);
  const events = (await store.list("calendar_events", a.id)).filter((e: any) => e.status === "confirmed");
  assert.equal(events.length, 3, "nothing was cancelled without a yes");
});

test("'remove her from my active clients' marks inactive and never deletes", async () => {
  const a = await setup();
  const r = await a.say("Remove Maya Brooks from my active clients");
  assert.match(r.milaMessage.content, /off your active clients/i);
  assert.ok(await maya(a), "contact still exists");
  assert.equal((await maya(a)).status, "inactive");
});

test("'before I leave' lists what is booked while away, and the block schedules an evening-before reminder", async () => {
  const a = await setup();
  const o = await a.say("I'm out of the office Wednesday through Thursday");
  assert.match(o.milaMessage.content, /Heads up|Blocked/);
  const rem = (await store.list("reminders", a.id)).find((r: any) => /out of office/i.test(r.title));
  assert.ok(rem, "a heads-up reminder exists");
  const r = await a.say("What do I need to do before I leave?");
  assert.match(r.milaMessage.content, /Before you're out/);
  assert.match(r.milaMessage.content, /booked while you're away/i);
  assert.doesNotMatch(r.milaMessage.content, /listing checklist|photographer/i);
});

test("a confirm text names the showings, times and places", async () => {
  const a = await setup();
  const r = await a.say("Text Maya to confirm tomorrow's showings");
  assert.match(r.milaMessage.content, /347 W Chestnut/);
  assert.match(r.milaMessage.content, /765 W Adams/);
  assert.match(r.milaMessage.content, /4:00 PM/);
});

test("emailing the details includes her showing schedule", async () => {
  const a = await setup();
  await a.say("Email Maya the details for all three apartments");
  const d = (await store.list("email_drafts", a.id))[0] as any;
  assert.match(d.body, /347 W Chestnut/);
  assert.match(d.body, /5:15 PM/);
});
