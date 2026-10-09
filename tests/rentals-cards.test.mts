// "Find rentals under $2,000 in Austin": up to 5 cards, ask who they are for, save to the client's profile (not Properties), pet policy for a client with a dog.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.MILA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mila-rent-"));
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.GOOGLE_MAPS_API_KEY;
process.env.RENTCAST_API_KEY = "rc-test";
const RENTALS = Array.from({ length: 8 }, (_, i) => ({ id: `R${i}`, addressLine1: `${200 + i} Lamar Blvd`, addressLine2: `#${i + 1}`, formattedAddress: `${200 + i} Lamar Blvd #${i + 1}, Austin, TX 78704`, city: "Austin", state: "TX", zipCode: "78704", price: 1500 + i * 60, bedrooms: 1, bathrooms: 1, squareFootage: 700, propertyType: "Apartment", daysOld: i, daysOnMarket: i, listedDate: "2026-10-01", petPolicy: i % 2 ? "Dogs and cats allowed" : null }));
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.rentcast.io") return realFetch(url, init);
  if (u.pathname === "/v1/listings/rental/long-term") return new Response(JSON.stringify(RENTALS), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("{}", { status: 404 });
}) as typeof fetch;

const { newAgent, blocks } = await import("./qa/harness.mts");

test("rentals come back as up to 5 swipeable cards, with a 'who is this for' step", async () => {
  const a = await newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });
  await a.say("New buyer Dana Reyes, 512-555-0199, wants a rental downtown under $2,000");
  const r = await a.say("Find rentals under $2,000 in Austin, TX for a client");
  const rail = blocks(r, "listings")[0] as any;
  assert.ok(rail, r.milaMessage.content);
  assert.equal(rail.cards.length, 5);
  assert.ok(rail.cards.every((c: any) => c.rental && c.price <= 2000));
  assert.match(JSON.stringify(r.milaMessage), /Who are these for\?/);
  assert.doesNotMatch(JSON.stringify(r.milaMessage), /https?:|rentcast|source/i);
});

test("saving puts the rentals on the client's profile, not in Properties", async () => {
  const a = await newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });
  await a.say("New buyer Dana Reyes, 512-555-0199, wants a rental downtown under $2,000. She has a dog.");
  const r = await a.say("Find rentals under $2,000 in Austin, TX for Dana");
  const rail = blocks(r, "listings")[0] as any;
  assert.ok(rail.cards.some((c: any) => /Pets:/.test(c.lines?.[0] ?? "")), "a client with a dog sees pet policies");
  const choice = (blocks(r, "choice") as any[]).find((b) => b.buttons.some((x: any) => x.action?.type === "save_rentals_for"));
  const saved = await a.act(choice.buttons[0].action);
  assert.match(saved.milaMessage.content, /Saved all 5 rentals to Dana's profile/);
  const props = await (await import("../src/lib/db/store.ts")).getStore().list("properties", a.id);
  assert.equal(props.length, 0);
  const mems = (await (await import("../src/lib/db/store.ts")).getStore().list("memories", a.id)).filter((m) => m.key.startsWith("Saved rental:"));
  assert.equal(mems.length, 5);
});
