import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const now = new Date("2026-10-19T19:00:00Z");
const say = async (a: any, t: string) => (await a.say(t)).milaMessage.content as string;
const C = (a: any, name: string, o: any = {}) => store.insert("contacts", a.id, { name, email: null, phone: null, type: "buyer", status: "active", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#888", ...o });

test("W7: calculators answer with the math, not a list or the fallback", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  assert.match(await say(a, "payment 615k 20%/6.75"), /Principal and interest: \$3,191\/month/);
  assert.match(await say(a, "What's the reduction percentage on 22 Quince Orchard Road from $689,900 to $674,900?"), /\$15,000 reduction, about 2\.17%/);
  assert.match(await say(a, "What is Mariela's net price if she pays $552,000 and gets a $4,000 credit?"), /\$548,000/);
  assert.match(await say(a, "seller gross 479k 5.5%"), /Commission \(5\.5%\): −\$26,345/);
  assert.match(await say(a, "commission on 479k at 2.5%"), /\$11,975/);
});

test("W7: budget questions are answered from saved contacts; unknown tax/HOA figures are not invented", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await C(a, "Desmond Hale", { budget_max: 410000 }); await C(a, "Corinne Abernathy", { budget_max: 550000 }); await C(a, "Big Spender", { budget_max: 900000 });
  const r = await say(a, "ok, which of my buyers are under $600k?");
  assert.match(r, /2 buyers under \$600,000/); assert.doesNotMatch(r, /Big Spender/);
  assert.match(await say(a, "how does Desmond's budget compare to Corinne's?"), /\$140,000 higher/);
  assert.match(await say(a, "HOA fees kentlands"), /don't have that figure/);
});

test("W7: the follow-up list shows each person once and the count matches", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const j = await C(a, "Jamie Park", { importance: 3, next_action: "Intro call", next_action_at: "2026-10-15T14:00:00Z" });
  await store.insert("tasks", a.id, { title: "Follow up with Jamie", status: "open", due_at: "2026-10-16T14:00:00Z", contact_id: j.id, kind: "task", subtitle: null, priority: "high", priority_reason: null, approval_id: null, property_id: null, workflow_run_id: null, completed_at: null });
  const r = await a.say("Who should I follow up with?");
  const items = r.milaMessage.blocks.flatMap((b: any) => b.groups?.flatMap((g: any) => g.items) ?? []);
  assert.equal(new Set(items.map((i: any) => i.contactId ?? i.id)).size, items.length);
});

test("W7: 'what did I get done today' has an answer", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  assert.doesNotMatch(await say(a, "What did I get done today?"), /not sure how/);
});
