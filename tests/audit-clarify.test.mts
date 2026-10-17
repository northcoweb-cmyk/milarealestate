import test from "node:test";
import assert from "node:assert/strict";
import { detectIntent } from "../src/lib/agent/intents";

test("vague bulk send asks instead of drafting (P0-03)", () => {
  assert.equal(detectIntent("send this to everyone now").intent, "vague_bulk");
  assert.notEqual(detectIntent("email everyone who came to the open house at 12 Oak St").intent, "vague_bulk");
});

test("uncertain contact asks before writing (P0-06)", () => {
  assert.equal(detectIntent("ok so um yesterday i think it was priya or dana i forget lol, they wanted 2 more homes this weekend, put a note on whoever it was and also whats on my plate this wek and remind me to follow up w tom thurs").intent, "unsure_who");
});

test("cancel with a date routes to cancel (P0-14)", () => {
  assert.equal(detectIntent("cancel QA TEST past date check on Sept 20").intent, "cancel_event");
});
