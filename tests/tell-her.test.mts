// "Yah tell her I can't help her find apartments" after talking about a client is an email card with actions, not loose chat text.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, blocks } from "./qa/harness.mts";

const now = new Date("2026-10-05T14:00:00Z");
const tz = "America/New_York";

test("'tell her …' on the client we were just discussing becomes an email draft card with buttons", async () => {
  const a = await newAgent({ now, tz, seed: false });
  await a.say("I have a new buyer named Aisha Khan, email aisha@example.com, looking for a 2 bedroom around $2000 a month");
  const res = await a.say("Yah tell her I can't help her find apartments");
  const cards = blocks(res, "draft_email");
  assert.equal(cards.length, 1, res.milaMessage.content);
  assert.match(String((cards[0] as any).to), /Aisha/);
  assert.ok(((cards[0] as any).buttons ?? []).length >= 1, "card has clickable outcomes");
});
