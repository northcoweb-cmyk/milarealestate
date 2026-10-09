// "Give me a script…" is a request for words to say: Mila asks what kind first, and never drafts a text to a person called "Give".
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, blocks } from "./qa/harness.mts";

test("a script request asks which kind and offers phone, meeting, text and email", async () => {
  const a = await newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });
  const r = await a.say("Give me a script for a buyer whose offer is $20k under asking");
  assert.match(r.milaMessage.content, /what kind of script/i);
  assert.doesNotMatch(JSON.stringify(r.milaMessage), /Here's the text to|Hi Give/);
  assert.equal((blocks(r, "choice")[0] as any).buttons.length, 4);
});
test("'What do I say?' asks too", async () => {
  const a = await newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });
  assert.match((await a.say("Tom wants to list $50k over comps. What do I say?")).milaMessage.content, /what kind of script/i);
});
