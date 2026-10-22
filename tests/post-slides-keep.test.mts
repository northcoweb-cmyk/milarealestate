import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { regenerate } from "../src/lib/content/service.ts";
import { buildCtx } from "../src/lib/agent/engine.ts";

const now = new Date("2026-10-22T15:00:00Z");

test("restyling a post never removes the images the agent added or the text and photos on them", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const prop: any = await store.insert("properties", a.id, { address: "14 Chestnut Hill Court", city: "Potomac", state: "MD", zip: "20854", list_price: 900000, beds: 4, baths: 3, sqft: 3000, verified: true });
  await a.say("Make a Just Listed post for 14 Chestnut Hill Court");
  const post: any = (await store.list("social_posts", a.id))[0];
  const slides = [post.slides[0], post.slides[1], { role: "highlight", headline: "Open Sunday", sub: "1 to 3", image_url: "/api/files/aaaaaaaa-0000-0000-0000-000000000001", theme: post.slides[0].theme, layout: "cinema" }, { role: "highlight", headline: "", plain: true, image_url: "/api/files/aaaaaaaa-0000-0000-0000-000000000002", layout: "cinema" }, post.slides[post.slides.length - 1]];
  await store.update("social_posts", a.id, post.id, { slides } as never);
  const ctx = await buildCtx((await store.get("profiles", a.id, a.id)) as never, { now });
  const re: any = await regenerate(ctx, (await store.get("social_posts", a.id, post.id)) as never);
  assert.equal(re.slides.length, 5);
  assert.equal(re.slides[2].headline, "Open Sunday"); assert.equal(re.slides[2].image_url, "/api/files/aaaaaaaa-0000-0000-0000-000000000001");
  assert.equal(re.slides[3].plain, true); assert.equal(re.slides[3].image_url, "/api/files/aaaaaaaa-0000-0000-0000-000000000002");
  void prop;
});
