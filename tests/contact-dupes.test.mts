// Audit P0-04: a duplicate is reported, never "added"; "add anyway" really adds.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { buildCtx } from "../src/lib/agent/engine.ts";
import { TOOLS } from "../src/lib/agent/tools.ts";

test("same phone, same name and same email are flagged as existing; force adds anyway", async () => {
  const a = await newAgent({ now: new Date("2026-10-16T15:00:00Z"), tz: "America/New_York", seed: false });
  const ctx = await buildCtx(a.profile);
  const first: any = await TOOLS.create_contact.run(ctx, { name: "Dana Reyes", phone: "(512) 555-0199", email: "dana@example.com" });
  assert.equal(first.data.existing, false);
  // the same name is the same person; the same number or email under a DIFFERENT name is another person (it used to merge them, which wrote one client's details onto another)
  const sameName: any = await TOOLS.create_contact.run(ctx, { name: "dana reyes", phone: "(512) 555-0100" });
  assert.equal(sameName.data.existing, true);
  assert.equal((await store.list("contacts", a.id)).length, 1);
  const sharedPhone: any = await TOOLS.create_contact.run(ctx, { name: "Sam Walker", phone: "512-555-0199" });
  assert.equal(sharedPhone.data.existing, false, "another name on the same number is a new contact");
  const sharedEmail: any = await TOOLS.create_contact.run(ctx, { name: "Dee Reyes", email: "DANA@example.com" });
  assert.equal(sharedEmail.data.existing, false);
  assert.equal((await store.list("contacts", a.id)).length, 3);
  const fullMatch: any = await TOOLS.create_contact.run(ctx, { name: "Dana Reyes", email: "DANA@example.com" });
  assert.equal(fullMatch.data.existing, true);
  const forced: any = await TOOLS.create_contact.run(ctx, { name: "Dana Reyes", phone: "512-555-0199", force: true });
  assert.equal(forced.data.existing, false);
  assert.equal((await store.list("contacts", a.id)).length, 4);
});
