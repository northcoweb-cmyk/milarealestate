import test from "node:test";
import assert from "node:assert/strict";
const { newAgent, blocks, store } = await import("./qa/harness.mts");
const now = new Date("2026-10-03T14:00:00Z"); // Sat 10:00 ET

test("an unrelated request is never swallowed by an open question", async () => {
  const a = await newAgent({ now, tz: "America/New_York" });
  assert.match((await a.say("Schedule an inspection for Friday")).milaMessage.content, /What time on Friday/);
  const r = await a.say("Remind me to call Dana");
  assert.doesNotMatch(r.milaMessage.content, /What time on Friday/);
  assert.match(r.milaMessage.content, /remind/i);
});

test("a bare time right after booking changes that event", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await a.say("Showing at 456 Oak Lane tomorrow at 3 PM");
  const r = await a.say("Actually make that 4");
  assert.match(r.milaMessage.content, /Moved to Sunday at 4:00 PM/);
  const ev = (await store.list("calendar_events", a.id)).filter((e: any) => /456 Oak/.test(e.title));
  assert.equal(ev.length, 1);
});

test("time off is blocked and conflicts are called out", async () => {
  const a = await newAgent({ now, tz: "America/New_York" });
  const r = await a.say("I'm out of town tomorrow");
  assert.match(r.milaMessage.content, /Blocked Sunday as out of office/);
  assert.ok((await store.list("calendar_events", a.id)).some((e: any) => e.title === "Out of office"));
});

test("two events in one message become two events", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await a.say("Book a showing at 11am and another at 2pm");
  const ev = (await store.list("calendar_events", a.id)).filter((e: any) => e.kind === "showing");
  assert.equal(ev.length, 2);
});

test("telling Mila about a client saves it and flags a contradiction", async () => {
  const a = await newAgent({ now, tz: "America/New_York" });
  const r = await a.say("Michael is pre-approved for 600k and wants a yard");
  assert.match(r.milaMessage.content, /Saved to Michael's profile/);
  assert.ok(blocks(r, "choice").some((b: any) => /seller/.test(b.body ?? "")));
});

test("a listing in one message is saved whole, with the sellers, and no questions", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const r = await a.say("I just got a new listing at 8814 Brookside Drive, Rockville MD 20850. 4 bed 3 bath, 2,400 sq ft, listed at $875,000. Sellers are the Hendersons");
  assert.match(r.milaMessage.content, /Saved your listing: 8814 Brookside Drive, Rockville, MD 20850/);
  assert.doesNotMatch(r.milaMessage.content, /\?/);
  const [p] = await store.list("properties", a.id);
  assert.deepEqual([p.beds, p.baths, p.sqft, p.list_price, p.verified], [4, 3, 2400, 875000, true]);
  assert.ok((await store.list("contacts", a.id)).some((c: any) => c.type === "seller" && /Henderson/.test(c.name)));
});

test("shorthand listings work: 3/2, $650k, price only, and no address asks once", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await a.say("Add my listing 22 Elm Court Bethesda MD, 3/2, $650k");
  await a.say("New listing: 14 Birch Lane. $725,000");
  const ps = await store.list("properties", a.id);
  assert.deepEqual(ps.map((p: any) => [p.address, p.beds, p.baths, p.list_price]).sort(), [["14 Birch Lane", null, null, 725000], ["22 Elm Court", 3, 2, 650000]]);
  const ask = await a.say("I listed a house on Maple Avenue for 540k");
  assert.match(ask.milaMessage.content, /What's the address/);
});

test("an open house message carries the price and beds, and a 1-3 range is understood", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const r = await a.say("listing at 77 Pine Road, Frederick MD 21701 $399,900 3br 2ba open house Sunday 1-3");
  assert.match(r.milaMessage.content, /prepared your open house/);
  const p = (await store.list("properties", a.id))[0];
  assert.deepEqual([p.list_price, p.beds, p.baths], [399900, 3, 2]);
  const ev = (await store.list("calendar_events", a.id)).find((e: any) => e.kind === "open_house");
  assert.equal(new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime(), 2 * 3_600_000);
});
