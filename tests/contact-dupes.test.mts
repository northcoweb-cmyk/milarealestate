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
  for (const dup of [{ name: "Sam Walker", phone: "512-555-0199" }, { name: "dana reyes", phone: "(512) 555-0100" }, { name: "Dee", email: "DANA@example.com" }]) {
    const r: any = await TOOLS.create_contact.run(ctx, dup);
    assert.equal(r.data.existing, true, JSON.stringify(dup));
  }
  assert.equal((await store.list("contacts", a.id)).length, 1);
  const forced: any = await TOOLS.create_contact.run(ctx, { name: "Sam Walker", phone: "512-555-0199", force: true });
  assert.equal(forced.data.existing, false);
  assert.equal((await store.list("contacts", a.id)).length, 2);
});
