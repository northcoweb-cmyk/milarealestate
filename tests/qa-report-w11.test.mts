import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { stripMarkup } from "../src/lib/names.ts";

const now = new Date("2026-10-19T19:00:00Z");

test("W11: markup typed into a name is removed, so no raw tags show anywhere", async () => {
  assert.equal(stripMarkup("QA TEST Jordan Lee 😀 <b>bold</b> O'Brien & Sons"), "QA TEST Jordan Lee 😀 bold O'Brien & Sons");
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await a.say("Add a contact named Jordan <i>x</i> Lee");
  assert.ok((await store.list("contacts", a.id)).every((c: any) => !/[<>]/.test(c.name)));
});

test("W11: the help-card chips never create sample data", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const help = await a.say("help");
  const prompts = help.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).map((b: any) => b.action?.text ?? "");
  assert.ok(prompts.length >= 4);
  for (const p of prompts) assert.doesNotMatch(p, /123 Main Street|named Sarah/);
  await a.say("Set up an open house"); await a.say("Add a new buyer");
  assert.equal((await store.list("calendar_events", a.id)).length, 0);
  assert.equal((await store.list("contacts", a.id)).length, 0);
});

test("W11: 'Get me ready to list' asks for the address", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  assert.match((await a.say("Get me ready to list")).milaMessage.content, /address/);
});
