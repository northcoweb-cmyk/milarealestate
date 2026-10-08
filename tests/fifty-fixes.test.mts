// From running 50 real agent questions through Mila: these phrasings each used to miss.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, blocks } from "./qa/harness.mts";

const now = new Date("2026-10-08T14:00:00Z");
const mk = () => newAgent({ now, tz: "America/New_York", seed: true });

test("'Actually that one has 4 bedrooms' updates the listing we just added", async () => {
  const a = await mk();
  await a.say("Add a listing at 85 Pike St, Seattle, WA 98101, 3 bed 2 bath, $749,000");
  const res = await a.say("Actually that one has 4 bedrooms");
  assert.match(res.milaMessage.content, /Updated 85 Pike/i);
  assert.match(res.milaMessage.content, /beds/i);
});

test("'Tell Tom …' drafts to Tom, not to a person called Tell Tom", async () => {
  const a = await mk();
  await a.say("Add a seller named Tom Alvarez, he wants to list 1 E Edenton St, Raleigh, NC next month");
  const res = await a.say("Tell Tom his listing photos are scheduled Tuesday");
  assert.doesNotMatch(res.milaMessage.content, /Tell Tom/);
});

test("searching her own contacts: 'Which of my buyers match…' and 'Anyone looking for homes under $400k in Charlotte?'", async () => {
  for (const q of ["Which of my buyers match 401 E Jefferson St, Phoenix, AZ at $525k, 3 bed?", "Anyone looking for homes under $400k in Charlotte?"]) {
    const a = await mk();
    const res = await a.say(q);
    assert.doesNotMatch(res.milaMessage.content, /not sure how to do that/i, q);
  }
});

test("tips and congrats posts are not built from whatever listing came up last", async () => {
  const a = await mk();
  await a.say("Open house at 2001 Blake St, Denver, CO 80205 Saturday 1 to 4");
  const tips = await a.say("Make a carousel with 5 tips for first-time buyers");
  const post = blocks(tips, "draft_social")[0] as any;
  assert.ok(post, tips.milaMessage.content);
  assert.doesNotMatch(JSON.stringify(post), /Blake/i);
  const sold = await a.say("Write a sold caption, congrats to the Nguyens");
  assert.doesNotMatch(JSON.stringify(blocks(sold, "draft_social")), /Blake/i);
  assert.match(sold.milaMessage.content, /which home|address/i);
});

test("a question about an open house checklist is not 'what's on my calendar'", async () => {
  const a = await mk();
  await a.say("Open house at 2001 Blake St, Denver, CO 80205 Saturday 1 to 4");
  const res = await a.say("What's on a good open house checklist?");
  assert.equal(blocks(res, "event").length, 0, res.milaMessage.content);
});
