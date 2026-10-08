// "What time on Friday?" → "They said 2" must book 2 PM, not give up.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent } from "./qa/harness.mts";

const now = new Date("2026-10-08T14:00:00Z");
const tz = "America/New_York";
const first = "Going to do a showing tomorrow with the turners at 1227 Main Street in Gaithersburg. Set me up";

for (const [answer, time] of [["They said 2", "2:00 PM"], ["2", "2:00 PM"], ["two", "2:00 PM"], ["around 2:30", "2:30 PM"], ["they said 4 in the afternoon", "4:00 PM"], ["11", "11:00 AM"]] as const) {
  test(`time question answered with "${answer}" books ${time}`, async () => {
    const a = await newAgent({ now, tz, seed: false });
    const q = (await a.say(first)).milaMessage.content;
    assert.match(q, /What time/i);
    const out = (await a.say(answer)).milaMessage.content;
    assert.match(out, new RegExp(`Added: Showing.*${time}`), out);
  });
}
