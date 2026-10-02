import test from "node:test";
import assert from "node:assert/strict";
import { STAGES, stageOf } from "../src/lib/pipeline";
import { CONTACT_STATUSES, CONTACT_TYPES } from "../src/lib/types";
import { eventEmoji, typeColor, TYPE_COLOR, contactEmoji } from "../src/lib/emoji";

test("every contact status belongs to exactly one pipeline stage", () => {
  for (const s of CONTACT_STATUSES) assert.equal(STAGES.filter((st) => st.statuses.includes(s)).length, 1, s);
  assert.equal(stageOf("under_contract").label, "Under contract");
});

test("every contact type has its own colour and emoji", () => {
  const colours = CONTACT_TYPES.filter((t) => t !== "other" && t !== "lead").map((t) => typeColor(t));
  assert.equal(new Set(colours).size, colours.length);
  for (const t of CONTACT_TYPES) { assert.ok(TYPE_COLOR[t], t); assert.ok(contactEmoji(t)); }
});

test("event kinds map to the right emoji", () => {
  assert.equal(eventEmoji("showing"), "🏠");
  assert.equal(eventEmoji("open_house"), "🏠");
  assert.equal(eventEmoji("call"), "📞");
  assert.equal(eventEmoji("nonsense"), "📌");
});
