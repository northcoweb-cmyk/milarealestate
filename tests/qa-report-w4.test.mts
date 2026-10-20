import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const now = new Date("2026-10-19T15:00:00Z");
const say = async (a: any, t: string) => (await a.say(t)).milaMessage.content as string;
const mk = (a: any, name: string, o: any = {}) => store.insert("contacts", a.id, { name, email: null, phone: null, type: "buyer", status: "active", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#888", ...o });
const drafts = async (a: any) => (await store.list("email_drafts", a.id)) as any[];

test("W4: the draft says what the agent said, in the right channel, to the right person", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await mk(a, "Marisol Treviño", { phone: "(301) 555-0111" });
  await mk(a, "Desmond Okafor");
  await mk(a, "Hollis Brandt", { email: "h@example.com" });
  assert.match(await say(a, "draft a text to marisol confirming saturday 10am showing tour in rockville"), /“Hi Marisol! I'm confirming Saturday 10 AM showing tour in Rockville\./);
  assert.equal((await drafts(a)).length, 0, "a text is not an email draft");
  await say(a, "draft a counter offer email to renosales14@gmail.com for 77 kentlands square. countering at 605k, we can do the 10k seller credit");
  let d = (await drafts(a))[0];
  assert.deepEqual(d.to_emails, ["renosales14@gmail.com"]);
  assert.match(d.subject, /Counter offer: 77 Kentlands Square/);
  assert.match(d.body, /counter at \$605,000/); assert.match(d.body, /\$10,000 seller credit/);
  assert.doesNotMatch(d.body, /Following up|draft a counter/i);
  await say(a, "draft a welcome email to Desmond Okafor, his email is desmond@example.com");
  d = (await drafts(a)).find((x: any) => x.subject === "Welcome");
  assert.ok(d); assert.match(d.body, /^Hi Desmond,/);
  assert.equal((await store.list("contacts", a.id)).find((c: any) => c.name === "Desmond Okafor").email, "desmond@example.com");
  await say(a, "Draft a new email that starts Hi Hollis and Mae and walks them through the launch plan for Bellemeade Court");
  d = (await drafts(a)).find((x: any) => /^Hi Hollis and Mae,/.test(x.body));
  assert.ok(d); assert.match(d.body, /launch plan for Bellemeade Court/); assert.equal(d.contact_id !== null, true);
});

test("W4: a listing agent who isn't a contact still gets the draft; the repair request carries the ask; text-only clients get a text", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await mk(a, "Theodora Vance-Pruitt", { phone: "(301) 555-0133" });
  const out = await say(a, "Draft a repair request email to Bennett Halloway, the listing agent for 9 Laytonsville Court, asking for the roof leak over the primary bedroom to be repaired by a licensed roofer before settlement.");
  assert.match(out, /draft for Bennett/);
  const d = (await drafts(a))[0];
  assert.match(d.body, /roof leak over the primary bedroom to be repaired by a licensed roofer before settlement/);
  await say(a, "Theodora Vance-Pruitt wants updates by text only. Please note that preference on her profile.");
  const t = await say(a, "Draft a message to Theodora letting her know the open house at 22 Quince Orchard Road is Sunday November 1, 1 to 3pm.");
  assert.match(t, /Here's the text to Theodora/); assert.match(t, /Sunday November 1, 1 to 3 PM|Sunday November 1, 1 to 3pm/);
});

test("W4: 'rewrite it to say…' replaces the last draft in place", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await mk(a, "Joaquin Mbeki", { email: "j@example.com" });
  await say(a, "Draft an email to Joaquin about 5 Hidden Garden Lane");
  const before = (await drafts(a)).length;
  const out = await say(a, "that draft is too generic. rewrite it to say the appraisal came in at 665k against the 680k contract and ask if the seller would meet in the middle");
  assert.match(out, /Rewritten/);
  const all = await drafts(a);
  assert.equal(all.length, before);
  assert.match(all[0].body, /\$665,000 against \$680,000/); assert.match(all[0].body, /meeting in the middle/);
});

test("W4: no vague bulk draft, no 'Congrats' for bad news, phone formatted in the signature", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  assert.match(await say(a, "draft smth to everyone"), /who is "everyone"/i);
  assert.doesNotMatch(await say(a, "Priyanka Vale is under contract and the inspection found a roof issue. Help me draft a repair request addendum summary."), /Congrats/);
  const { prettyPhone } = await import("../src/lib/signature");
  assert.equal(prettyPhone("3015097280"), "(301) 509-7280");
  assert.equal(prettyPhone("301.509.7280"), "(301) 509-7280");
});
