// Test accounts (like northcoweb@yahoo.com) are not stopped by the trial's credits, clock, AI allowance or lookup limits. Real customers keep them.
import test from "node:test";
import assert from "node:assert/strict";
import { getStore } from "../src/lib/db/store.ts";
import { createProfile } from "../src/lib/users.ts";
import { InsufficientCredits, ensureCredits, getBalance, grantCredits } from "../src/lib/credits.ts";
import { tierOf } from "../src/lib/media/limits.ts";

test("a tester at zero credits is topped up; a customer at zero credits is stopped", async () => {
  const tester = await createProfile({ email: "northcoweb@yahoo.com", full_name: "North Co" });
  const customer = await createProfile({ email: "someone@brokerage.com", full_name: "Some One" });
  for (const u of [tester, customer]) await grantCredits(u.id, -(await getBalance(u.id)), "adjust", "drain for test");
  assert.equal(await getBalance(tester.id), 0);
  await ensureCredits(tester.id, 5);
  assert.ok((await getBalance(tester.id)) >= 3000);
  assert.equal(await tierOf(tester.id), "pro");
  await assert.rejects(() => ensureCredits(customer.id, 5), (e) => e instanceof InsufficientCredits);
  void getStore;
});
