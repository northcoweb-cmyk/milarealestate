// Posts made in chat look like the Content tab (palette + layout), tips are real numbered tips, sold posts are two slides, and several posts come back as one set.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, blocks } from "./qa/harness.mts";

const mk = () => newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });

test("5 tips for first-time buyers gives 5 numbered tips, one image each, no property photos", async () => {
  const a = await mk();
  await a.say("Add a listing at 85 Pike St, Seattle, WA 98101, 3 bed 2 bath, $749,000");
  const r = await a.say("Make a carousel with 5 tips for first-time buyers");
  const post = blocks(r, "draft_social")[0] as any;
  assert.ok(post, r.milaMessage.content);
  assert.equal(post.slides.length, 3); // a carousel is always three images: cover, the whole list, who to call
  assert.equal(post.slides[1].headline.split("\n").length, 5);
  assert.match(post.slides[0].headline, /5 tips for first-time buyers/i);
  assert.match(post.caption, /1\. .*\n.*2\. /s);
  assert.doesNotMatch(post.caption, /Make a carousel/);
  assert.ok(post.slides.every((s: any) => !s.image_url), "no property photo on a post that is not about a property");
});

test("a sold post with a name is a big SOLD image plus a thank-you to them; with no name it is one image", async () => {
  const a = await mk();
  await a.say("Write a sold caption, congrats to the Nguyens");
  const r = await a.say("It was 4910 Mueller Blvd, Austin, TX 78723");
  const post = blocks(r, "draft_social")[0] as any;
  assert.equal(post.slides.length, 2);
  assert.equal(post.slides[0].headline, "SOLD");
  assert.match(post.slides[1].headline, /Congratulations, The Nguyens!/);
  assert.match(post.caption, /Congratulations to The Nguyens/);
  assert.equal(post.category, "just_sold");
  const b = await mk();
  const r2 = await b.say("Make a just sold post for 4910 Mueller Blvd, Austin, TX 78723");
  const solo = blocks(r2, "draft_social")[0] as any;
  assert.equal(solo.slides.length, 1);
  assert.equal(solo.slides[0].headline, "SOLD");
});

test("chat posts carry a design (palette and layout), and 3 posts come as one swipeable set with different looks", async () => {
  const a = await mk();
  await a.say("Add a listing at 85 Pike St, Seattle, WA 98101, 3 bed 2 bath, $749,000");
  const r = await a.say("Make 3 Instagram posts for 85 Pike St");
  const set = blocks(r, "post_set")[0] as any;
  assert.ok(set, JSON.stringify(r.milaMessage.blocks.map((b: any) => b.type)));
  assert.equal(set.options.length, 3);
  assert.equal(blocks(r, "draft_social").length, 0);
  const themes = set.options.map((o: any) => `${o.post.slides[0].theme}/${o.post.slides[0].layout}`);
  assert.ok(themes.every((t: string) => !t.includes("undefined")), themes.join());
  assert.ok(new Set(themes).size >= 2, `the options should not all look the same: ${themes.join()}`);
});

test("a story request is a story post", async () => {
  const a = await mk();
  await a.say("Add a listing at 85 Pike St, Seattle, WA 98101, 3 bed 2 bath, $749,000");
  const r = await a.say("Make a price improvement story for 85 Pike St");
  assert.equal((blocks(r, "draft_social")[0] as any).platform, "instagram_story");
});

test("stories are one image; carousels are three", async () => {
  const a = await mk();
  await a.say("Add a listing at 85 Pike St, Seattle, WA 98101, 3 bed 2 bath, $749,000");
  const story = blocks(await a.say("Make a price improvement story for 85 Pike St"), "draft_social")[0] as any;
  assert.equal(story.slides.length, 1);
  const set = blocks(await a.say("Make 3 Instagram posts for 85 Pike St"), "post_set")[0] as any;
  for (const o of set.options) assert.equal(o.post.slides.length, 3, o.label);
  const oh = blocks(await a.say("Open house post for 85 Pike St, Seattle, WA 98101 this Saturday 1 to 4"), "draft_social")[0] as any;
  assert.equal(oh.slides.length, 3);
});
