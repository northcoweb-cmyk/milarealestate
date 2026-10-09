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
  assert.equal(post.slides.length, 7); // cover + 5 tips + closing
  assert.match(post.slides[0].headline, /5 tips for first-time buyers/i);
  assert.match(post.caption, /1\. .*\n.*2\. /s);
  assert.doesNotMatch(post.caption, /Make a carousel/);
  assert.ok(post.slides.every((s: any) => !s.image_url), "no property photo on a post that is not about a property");
});

test("a sold post is a big SOLD image and a thank-you, two slides", async () => {
  const a = await mk();
  await a.say("Write a sold caption, congrats to the Nguyens");
  const r = await a.say("It was 4910 Mueller Blvd, Austin, TX 78723");
  const post = blocks(r, "draft_social")[0] as any;
  assert.equal(post.slides.length, 2);
  assert.equal(post.slides[0].headline, "SOLD");
  assert.equal(post.category, "just_sold");
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
