// Mila tells residential, multifamily, commercial and land apart, and asks for the right details for each.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent } from "./qa/harness.mts";

const mk = () => newAgent({ now: new Date("2026-10-08T14:00:00Z"), tz: "America/Chicago", seed: false });

test("a house asks for beds, baths and size", async () => {
  const a = await mk();
  const r = (await a.say("Add a listing at 85 Pike St, Seattle, WA 98101")).milaMessage.content;
  assert.match(r, /Still blank:.*beds/i);
});

test("a commercial listing never asks for beds and baths, and asks for zoning and lease details", async () => {
  const a = await mk();
  const r = (await a.say("New commercial retail listing at 500 Main St, Austin, TX 78701, 4,200 sq ft, $1,250,000")).milaMessage.content;
  assert.match(r, /Retail space/);
  assert.match(r, /zoning/i);
  assert.doesNotMatch(r, /Still blank:[^\n]*(beds|baths)/i);
  assert.match(r, /Asking \$1,250,000/);
});

test("a duplex is multifamily; land asks for acreage", async () => {
  const a = await mk();
  assert.match((await a.say("Add a duplex listing at 12 Oak St, Austin, TX 78704, $620,000")).milaMessage.content, /Duplex/);
  const land = (await a.say("New listing: 20 acres of vacant land at 9 County Road 12, Dripping Springs, TX 78620")).milaMessage.content;
  assert.match(land, /Land/);
  assert.match(land, /acreage/i);
  assert.doesNotMatch(land, /Still blank:[^\n]*(beds|baths)/i);
});

test("telling Mila what kind it is changes what she asks for", async () => {
  const a = await mk();
  await a.say("Add a listing at 700 Congress Ave, Austin, TX 78701");
  const r = (await a.say("That one is commercial")).milaMessage.content;
  assert.match(r, /Marked 700 Congress/);
  assert.match(r, /zoning/i);
  assert.doesNotMatch(r, /Still blank:[^\n]*(beds|baths)/i);
});

test("what am I missing speaks the property's own language", async () => {
  const a = await mk();
  await a.say("New commercial office listing at 500 Main St, Austin, TX 78701, 9,000 sq ft");
  const r = await a.say("What am I missing on 500 Main St?");
  const txt = JSON.stringify(r.milaMessage);
  assert.match(txt, /The office space/);
  assert.doesNotMatch(txt, /beds, baths or size/i);
});
