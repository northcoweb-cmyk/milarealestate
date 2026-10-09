// Said on Thursday afternoon, "Thursday at noon" means next Thursday, not "that time has already passed".
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent } from "./qa/harness.mts";

const now = new Date("2026-10-08T20:00:00Z"); // Thursday 3:00 PM in Austin
test("a weekday named on that same weekday, after the time, rolls to next week", async () => {
  const a = await newAgent({ now, tz: "America/Chicago", seed: false });
  const r = (await a.say("Lunch with Mark Chen at noon Thursday")).milaMessage.content;
  assert.match(r, /Added: Lunch with Mark Chen/);
  assert.match(r, /Oct 15|Thursday, Oct|Thursday/);
  assert.doesNotMatch(r, /already passed/i);
  const o = (await a.say("Inspection at 4910 Mueller Blvd, Austin, TX 78723 Thursday at 9am")).milaMessage.content;
  assert.match(o, /Added: Inspection/);
});
test("'today' at a past time still says it passed", async () => {
  const a = await newAgent({ now, tz: "America/Chicago", seed: false });
  assert.match((await a.say("Lunch with Mark Chen today at noon")).milaMessage.content, /already passed/i);
});
