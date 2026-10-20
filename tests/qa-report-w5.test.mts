import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";

const now = new Date("2026-10-19T19:00:00Z"); // Mon Oct 19, 3 PM ET
const say = async (a: any, t: string) => (await a.say(t)).milaMessage.content as string;
const events = async (a: any) => (await store.list("calendar_events", a.id)).filter((e: any) => e.status === "confirmed") as any[];
const mk = (a: any, name: string) => store.insert("contacts", a.id, { name, email: null, phone: null, type: "buyer", status: "active", tags: [], notes: null, preferences: {}, location: null, budget_min: null, budget_max: null, timeline: null, source: null, importance: 2, last_contact_at: null, next_action: null, next_action_at: null, avatar_color: "#888" });

test("W5: named appointments keep their own name; 'sat 1 to 4' is 1 to 4", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  assert.match(await say(a, "Book the photographer for 22 Quince Orchard Road on Monday, October 26 at 10am at the property."), /Added: Photographer — 22 Quince Orchard Road/);
  assert.match(await say(a, "Put a sign install on my calendar for Tuesday October 27 at 9am at 22 Quince Orchard Road"), /Sign Install — 22 Quince Orchard Road, Tuesday, Oct 27 • 9:00 AM/);
  await say(a, "open house sat 1 to 4 at 22 Quince Orchard Road");
  const oh = (await events(a)).find((e: any) => /Open House/.test(e.title));
  assert.equal(new Date(oh.end_at).getTime() - new Date(oh.start_at).getTime(), 3 * 3_600_000);
});

test("W5: contract dates in one message become separate deadlines; an accepted offer saves and asks the closing date once", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  const asked = await say(a, "Great news, the offer on 9 Laytonsville Ct was accepted today, Oct 19, at $552,000. Her $5,000 earnest money deposit is due in 3 business days.");
  assert.match(asked, /accepted at \$552,000/); assert.match(asked, /What's the closing date/);
  assert.doesNotMatch(asked, /already passed/);
  await say(a, "Update 9 Laytonsville Ct: inspection contingency deadline October 29, appraisal due November 6, financing commitment November 13, settlement Friday November 20 at 10:00 AM in Rockville.");
  const titles = (await events(a)).map((e: any) => e.title);
  for (const t of ["Inspection", "Appraisal", "Financing contingency", "Closing"]) assert.ok(titles.some((x: string) => x.startsWith(t)), `${t} in ${titles.join(" | ")}`);
  const closing = (await events(a)).find((e: any) => e.title.startsWith("Closing"));
  assert.equal(new Date(closing.start_at).toISOString(), "2026-11-20T15:00:00.000Z"); // 10:00 AM ET
});

test("W5: time off — 'thru fri' lands after the start, the span is stated, queries read and never create, edits change the block", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await say(a, "next wed thru fri I am out of the office");
  const q = await say(a, "how long is that out of office block?");
  assert.match(q, /Wed Oct 28 8:00 AM to Fri Oct 30 6:00 PM/);
  assert.equal((await events(a)).filter((e: any) => e.title === "Out of office").length, 1);
  const c = await say(a, "Schedule a call with Naomi Thursday Oct 29 at 4pm");
  assert.match(c, /Wed Oct 28 8:00 AM to Fri Oct 30 6:00 PM/);
  await say(a, "change my out of office to Wednesday only");
  const b = (await events(a)).find((e: any) => e.title === "Out of office");
  assert.equal(new Date(b.end_at).getTime() - new Date(b.start_at).getTime(), 10 * 3_600_000);
});

test("W5: reminder titles keep their words; reminders can be listed and marked done; cancelling something that isn't there says so", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await say(a, "remind me to follow up with Desmond Okafor friday morning");
  await say(a, "Set a reminder for the roof repair response deadline, Monday Nov 2 at 5pm");
  const titles = (await store.list("reminders", a.id)).map((r: any) => r.title);
  assert.ok(titles.includes("Follow up with Desmond Okafor")); assert.ok(titles.includes("The roof repair response deadline"));
  assert.match(await say(a, "what are my 9am reminders friday?"), /Follow up with Desmond Okafor/);
  assert.match(await say(a, "mark the 9am reminder on friday as done"), /Marked done/);
  assert.equal((await store.list("reminders", a.id)).find((r: any) => /Desmond/.test(r.title)).status, "done");
  assert.match(await say(a, "cancel the dentist"), /don't see anything called “dentist”/);
  await say(a, "add a task: send the disclosure packet for 77 kentlands square, due wednesday");
  assert.equal((await store.list("tasks", a.id)).find((t: any) => /disclosure/.test(t.title)).title, "Send the disclosure packet for 77 kentlands square");
});

test("W5: 'week of Oct 26' is that week, not this one", async () => {
  const a = await newAgent({ now, tz: "America/New_York", seed: false });
  await say(a, "Book the photographer for 22 Quince Orchard Road on Monday, October 26 at 10am");
  const out = await say(a, "What's my week of Oct 26 look like?");
  assert.match(out, /Week of Oct 26/); assert.match(out, /1 thing/);
  void mk;
});
