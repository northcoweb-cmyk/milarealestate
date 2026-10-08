// One agent's whole week as 50 messages in order (docs/knowledge-base/16-mila-50-tests.md). Each step must be understood in one go.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, blocks } from "./qa/harness.mts";

test("an Austin agent's week: the key steps land where they should", async () => {
  const a = await newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });
  const say = async (t: string) => (await a.say(t)).milaMessage.content;
  assert.match(await say("Good morning. What do I have today?"), /calendar|free|today/i);
  await say("Add a seller named Tom Alvarez, tom.alvarez@example.com, 512-555-0142. He's listing his home next month.");
  await say("I signed Tom's listing at 1100 Congress Ave, Austin, TX 78701. It's 3 bed 2 bath, listing at $749,000.");
  assert.doesNotMatch(await say("Tell Tom his listing photos are scheduled Tuesday at 10."), /Tell Tom/);
  await say("New buyer Priya Shah, priya.shah@example.com, 512-555-0188, budget $450k, 3 bed, around Round Rock, pre-approved.");
  assert.match(await say("shwoing with Priya Shah at 3400 E Palm Valley Blvd, Round Rock, TX 78665 wed at 4"), /Added: Showing/);
  assert.doesNotMatch(await say("Prep me for that showing."), /not sure how to do that/i);
  assert.doesNotMatch(await say("Text Priya I'm running 10 minutes late."), /who is|which/i);
  assert.doesNotMatch(await say("Which of my buyers match 1100 Congress Ave?"), /not sure how to do that/i);
  await say("New buyer Dana Reyes, 512-555-0199, wants a condo downtown under $500k, closing by December.");
  assert.match(await say("Showing with Dana Reyes at 710 W Cesar Chavez St, Austin, TX 78701 tomorrow."), /what time/i);
  assert.match(await say("They said 2"), /2:00 PM/);
  assert.match(await say("Move it to Friday at 11."), /Moved/i);
  await say("Open house at 2201 Barton Springs Rd, Austin, TX 78746 Saturday 1 to 4.");
  await say("Price drop on 1100 Congress Ave, now $725k.");
  assert.match(await say("Make a price improvement story for it."), /1100 Congress/);
  const tips = await a.say("Make a carousel with 5 tips for first-time buyers.");
  assert.doesNotMatch(JSON.stringify(blocks(tips, "draft_social")), /Congress|Barton/i);
  assert.match(await say("Write a sold caption, congrats to the Nguyens."), /which home/i);
  assert.match(await say("It was 4910 Mueller Blvd, Austin, TX 78723."), /Just Sold/i);
  assert.match(await say("OPEN HOUSE POST FOR 601 UNIVERSITY DR, SAN MARCOS, TX 78666"), /open house/i);
  assert.match(await say("Sunday 2 to 5."), /open house/i);
  await say("Add a referral listing for my past client Amy Lopez at 85 Pike St, Seattle, WA 98101, 3 bed 2 bath, $749,000.");
  assert.match(await say("Actually that one has 4 bedrooms."), /Updated 85 Pike/);
});
