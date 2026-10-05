// The four requests a serious agent would try in the first five minutes.
import test from "node:test";
import assert from "node:assert/strict";

const { newAgent, blocks, store, local } = await import("./qa/harness.mts");
const now = new Date("2026-10-05T14:00:00Z"); // Monday 10:00 ET
const tz = "America/New_York";

async function seeded() {
  const a = await newAgent({ now, tz });
  const contacts = await store.list("contacts", a.id);
  const props = await store.list("properties", a.id);
  const john = contacts.find((c: any) => c.name === "John Smith");
  const main = props.find((p: any) => /123 Main/.test(p.address));
  await store.insert("calendar_events", a.id, { title: "Meeting with John Smith", kind: "meeting", start_at: "2026-10-05T18:00:00.000Z", end_at: "2026-10-05T18:30:00.000Z", location: null, property_id: main.id, contact_id: john.id, status: "confirmed", source: "manual", external_id: null, synced_at: null, workflow_run_id: null, notes: "Wants to talk about making an offer" });
  await store.insert("contact_events", a.id, { contact_id: john.id, kind: "email_sent", title: "Emailed: 123 Main Street details", detail: null, occurred_at: "2026-10-01T15:00:00.000Z" });
  await store.insert("contact_notes", a.id, { contact_id: john.id, body: "Pre-approved at $650k. Needs a first-floor bedroom for his mom." });
  await store.update("contacts", a.id, john.id, { budget_max: 650000, budget_min: 550000, last_contact_at: "2026-10-01T15:00:00.000Z" });
  // two people who toured 123 Main last week
  const who = contacts.filter((c: any) => c.email && c.id !== john.id).slice(0, 2);
  for (const [i, c] of who.entries()) await store.insert("calendar_events", a.id, { title: `Showing — 123 Main Street`, kind: "showing", start_at: new Date(now.getTime() - (5 + i) * 86_400_000).toISOString(), end_at: new Date(now.getTime() - (5 + i) * 86_400_000 + 3_600_000).toISOString(), location: null, property_id: main.id, contact_id: c.id, status: "confirmed", source: "manual", external_id: null, synced_at: null, workflow_run_id: null, notes: null });
  return { a, john, main, who };
}

test("#1 'I have an open house Sunday at 1 PM. Set everything up.' - no questions, event + property + prep", async () => {
  const { a } = await seeded();
  const r = await a.say("I have an open house Sunday at 1 PM. Set everything up.");
  assert.ok(!/^Which property/i.test(r.milaMessage.content), r.milaMessage.content);
  assert.match(r.milaMessage.content, /I used .* — your/);
  const oh = (await store.list("calendar_events", a.id)).find((e: any) => e.kind === "open_house");
  assert.ok(oh, "open house created");
  const p = local(oh.start_at, tz);
  assert.deepEqual([p.m, p.d, p.h], [10, 11, 13], "Sunday Oct 11 at 1 PM");
  assert.ok(oh.property_id, "attached to a property");
  assert.ok(r.milaMessage.blocks.length > 0, "shows the prepared plan");
});

test("#2 'Prep me for my 2 PM meeting with John.' - the file, not a new meeting", async () => {
  const { a } = await seeded();
  const before = (await store.list("calendar_events", a.id)).length;
  const r = await a.say("Prep me for my 2 PM meeting with John.");
  assert.equal((await store.list("calendar_events", a.id)).length, before, "must not create a meeting");
  const b = blocks(r, "listing_brief")[0];
  assert.equal(b.kicker, "Meeting prep");
  const all = JSON.stringify(b.sections);
  assert.match(all, /Meeting with John Smith/);
  assert.match(all, /first-floor bedroom/, "previous notes");
  assert.match(all, /Emailed: 123 Main Street details/, "previous conversation");
  assert.match(all, /123 Main Street/, "property");
  assert.match(all, /\$550,000–\$650,000|650,000/, "budget");
  assert.match(all, /making an offer/, "meeting notes");
});

test("#3 'Follow up with everyone I showed 123 Main Street to last week' - finds the people, drafts one each", async () => {
  const { a, who } = await seeded();
  const r = await a.say("Follow up with everyone I showed 123 Main Street to last week.");
  const drafts = blocks(r, "draft_email");
  assert.equal(drafts.length, who.length, JSON.stringify(r.milaMessage.content));
  for (const d of drafts) { assert.match(d.subject, /123 Main Street/); assert.match(d.body, /Thank you for taking the time to see 123 Main Street/); assert.match(d.body, /^Hi \{\{first_name\}\}|^Hi \w+/); }
  assert.deepEqual(new Set(drafts.map((d: any) => d.to.split(" <")[0])), new Set(who.map((c: any) => c.name)));
  assert.ok((await store.list("approvals", a.id)).some((x: any) => x.status === "pending" && /Follow-ups/.test(x.title)), "waiting for approval, nothing sent");
  assert.ok(!(await store.list("email_drafts", a.id)).some((d: any) => d.status === "sent"));
});

test("#4 'What am I forgetting today?' - the whole day, with a button for each", async () => {
  const { a } = await seeded();
  const r = await a.say("What am I forgetting today?");
  const b = blocks(r, "listing_brief")[0];
  assert.equal(b.kicker, "Today");
  const items = b.sections.flatMap((s: any) => s.items);
  assert.ok(items.some((i: any) => /Meeting with John Smith/.test(i.text) && /Prep me/.test(i.button?.label ?? "")), "today's meeting with a prep button");
  assert.ok(items.some((i: any) => i.state === "missing" && i.button), "actionable items");
  assert.match(r.milaMessage.content, /forget today/);
});

test("'What am I missing?' still means the listing in progress", async () => {
  const a = await newAgent({ now, tz });
  await a.say("I'm listing 8814 Brookside Drive, Rockville MD next Thursday. Get me ready.");
  const r = await a.say("What am I missing?");
  assert.match(r.milaMessage.content, /8814 Brookside Drive/);
});
