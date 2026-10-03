import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mila-test-"));
process.env.MILA_DATA_DIR = dir;
delete process.env.ANTHROPIC_API_KEY;
// Thursday Oct 1 2026, 9:00 AM ET
(globalThis as any).__milaNow = new Date("2026-10-01T13:00:00Z");

const { createTestStore } = await import("../src/lib/db/store");
const store = createTestStore(dir);
const { createProfile } = await import("../src/lib/users");
const { seedDemoData } = await import("../src/lib/db/seed");
const { handleTurn } = await import("../src/lib/agent/engine");
const { getBalance } = await import("../src/lib/credits");
const { putFile } = await import("../src/lib/files");

const profile = await createProfile({ email: "sarah@demo.test", full_name: "Sarah Carter", demo: true });
await store.update("profiles", profile.id, profile.id, { timezone: "America/New_York", location: "Gaithersburg, MD", primary_market: "Montgomery County, MD", onboarded: true });
const p = (await store.get("profiles", profile.id, profile.id))!;
p.settings = { ...p.settings, workflows: { email_contacts: true } }; // most tests exercise the email path; the opt-in default is tested separately below
await seedDemoData(p);

const say = (message: string, extra: any = {}) => handleTurn(p, { message, ...extra });
const act = (action: any) => handleTurn(p, { action });
const blocks = (o: any, type: string) => o.milaMessage.blocks.filter((b: any) => b.type === type);

test("open house end-to-end", async () => {
  const o = await say("I have an open house at 123 Main Street Sunday at 1 PM. Set everything up.");
  assert.match(o.milaMessage.content, /prepared your open house/);
  const wf = blocks(o, "workflow")[0];
  assert.equal(wf.title, "123 Main Street");
  assert.match(wf.subtitle, /Sunday/);
  const labels = wf.items.map((i: any) => i.label);
  for (const l of ["Calendar event", "Reminder", "Open-house email", "Instagram carousel", "Open-house checklist", "Follow-up workflow"]) assert.ok(labels.includes(l), l);
  const events = (await store.list("calendar_events", p.id)).filter((e) => e.kind === "open_house");
  assert.equal(events.length, 1);
  assert.equal(new Date(events[0].start_at).toISOString(), "2026-10-04T17:00:00.000Z");
  const pend = (await store.list("approvals", p.id)).filter((a) => a.status === "pending" && a.workflow_run_id === wf.runId);
  assert.equal(pend.length, 2); // email + social
  assert.equal((await store.list("reminders", p.id)).length, 1);
  const draft = (await store.list("email_drafts", p.id)).find((d) => d.subject.startsWith("Open House"))!;
  assert.ok(draft.to_contact_ids.length > 0);
  assert.match(draft.body, /3 bed/); // verified demo facts are used
});

test("moving the open house marks comms stale, then updates them", async () => {
  const o = await say("I moved the open house to Saturday at 2");
  assert.match(o.milaMessage.content, /Moved to Saturday at 2:00 PM/);
  const choice = blocks(o, "choice")[0];
  assert.match(choice.title, /mention Sunday/);
  const ev = (await store.list("calendar_events", p.id)).find((e) => e.kind === "open_house")!;
  assert.equal(new Date(ev.start_at).toISOString(), "2026-10-03T18:00:00.000Z");
  assert.equal(new Date(ev.end_at).toISOString(), "2026-10-03T20:00:00.000Z");
  const u = await act({ type: "stale_comms", choice: "update", eventId: ev.id });
  assert.match(u.milaMessage.content, /Updated the email and the social post/);
  const d = (await store.list("email_drafts", p.id)).find((x) => x.subject.startsWith("Open House"))!;
  assert.match(d.body, /Saturday/);
  assert.ok(!d.stale);
});

test("a direct move command is done immediately, with an Undo", async () => {
  const o = await say("Move my showing at 123 Main Street to Friday at 3");
  assert.match(o.milaMessage.content, /Moved to Friday at 3:00 PM/);
  const undo = blocks(o, "choice").find((b: any) => b.title === "Wrong?");
  assert.ok(undo, "offers undo");
  const back = await act(undo.buttons[0].action);
  assert.match(back.milaMessage.content, /Moved to/);
  const ev = (await store.list("calendar_events", p.id)).find((e) => e.kind === "showing" && /123 Main/.test(e.title))!;
  assert.notEqual(new Date(ev.start_at).toISOString(), "2026-10-02T19:00:00.000Z", "undo restored the original time");
});

test("priorities use real data", async () => {
  const o = await say("Who do I need to follow up with today?");
  const g = blocks(o, "priorities")[0].groups;
  const urgent = g.find((x: any) => x.priority === "urgent");
  assert.ok(urgent && urgent.items.length <= 3);
  assert.ok(g.flatMap((x: any) => x.items).some((i: any) => i.title === "Sarah Johnson"));
});

test("calendar conflict is detected, never double-booked", async () => {
  const o = await say("Schedule a showing at 1 PM today");
  assert.match(o.milaMessage.content, /already have Lunch with John Smith/);
  assert.equal(blocks(o, "choice")[0].buttons.length, 3);
  assert.equal((await store.list("calendar_events", p.id)).filter((e) => e.title.startsWith("Showing") && e.start_at.startsWith("2026-10-01T17")).length, 0);
});

test("new buyer is structured into a contact + memory + follow-up", async () => {
  const o = await say("I have a new buyer named Dana Reyes. She's looking for a 3 bedroom house around $650k in Frederick County and wants to move in the next 3 months. Set her up.");
  const wf = blocks(o, "workflow")[0];
  assert.equal(wf.kicker, "NEW BUYER");
  const c = (await store.list("contacts", p.id)).find((x) => x.name === "Dana Reyes")!;
  assert.equal(c.budget_max, 650000);
  assert.equal(c.preferences.beds_min, 3);
  assert.equal(c.timeline, "Next 3 months");
  assert.equal(c.location, "Frederick County");
  assert.ok((await store.list("memories", p.id)).some((m) => m.subject_id === c.id));
  const o2 = await say("Find something for Dana");
  assert.match(o2.milaMessage.content, /3\+ bedrooms/);
  assert.match(o2.milaMessage.content, /can't pull live listings/);
});

test("sign-in sheet import, dedupe, ambiguity, follow-ups", async () => {
  const csv = "Name,Email,Phone,Notes\nJohn Smith,john.smith@example.com,,asked about financing\nPaula Green,paula@example.com,301-555-0188,just starting to look\nTed,,,\nSam Lee,sam@example.com,240-555-0100,wants to sell his condo\n";
  const id = randomUUID();
  const sp = await putFile(p.id, id, Buffer.from(csv), "text/csv");
  const doc = await store.insert("documents", p.id, { id, name: "signin.csv", kind: "csv", mime: "text/csv", size_bytes: csv.length, storage_path: sp, text_content: null, extracted: null, property_id: null, contact_id: null, summary: null } as any);
  const o = await say("Here's my open house sign-in sheet", { attachmentIds: [doc.id] });
  assert.match(o.milaMessage.content, /added 2 new contacts and updated 1 existing contact/i);
  assert.equal(blocks(o, "choice").length, 1); // Ted needs clarification
  assert.equal((await store.list("contacts", p.id)).filter((c) => c.name === "John Smith").length, 1); // not duplicated
  const f = await say("Draft a follow-up for everyone who came");
  const drafts = blocks(f, "draft_email");
  assert.ok(drafts.length >= 1);
  const all = (await store.list("email_drafts", p.id)).filter((d) => d.subject.startsWith("Great meeting"));
  assert.equal(all.length, 3);
  const john = all.find((d) => d.body.includes("John"))!;
  assert.match(john.body, /financing/);
  const paula = all.find((d) => d.body.includes("Paula"))!;
  assert.match(paula.body, /No rush/);
  const sent = (await store.list("approvals", p.id)).filter((a) => a.payload.tool === "send_email_batch" && a.status === "pending");
  assert.equal(sent.length, 1); // nothing sent automatically
});

test("market question without live data is honest", async () => {
  const o = await say("What's happening in the Gaithersburg market?");
  const n = blocks(o, "notice")[0];
  assert.match(n.title, /isn't available/);
  assert.equal(blocks(o, "market").length, 0);
});

test("approving an email without Gmail does not pretend it sent", async () => {
  const ap = (await store.list("approvals", p.id)).find((a) => a.payload.tool === "send_email" && a.status === "pending")!;
  const o = await act({ type: "approve", id: ap.id });
  assert.match(o.milaMessage.content, /couldn't finish/);
  const after = (await store.get("approvals", p.id, ap.id))!;
  assert.equal(after.status, "approved");
  assert.equal(after.blocked_integration, "google");
  assert.ok((await store.list("email_drafts", p.id)).every((d) => d.status !== "sent"));
});

test("credits are charged and the ledger records usage", async () => {
  const usage = await store.list("usage", p.id);
  assert.ok(usage.length > 5);
  assert.ok((await getBalance(p.id)) < 100000);
});

test("data isolation: another user sees nothing", async () => {
  const other = await createProfile({ email: "other@test.dev", full_name: "Other Agent" });
  assert.equal((await store.list("contacts", other.id)).length, 0);
  assert.equal(await store.get("contacts", other.id, (await store.list("contacts", p.id))[0].id), null);
});

test("unverified properties never get invented facts", async () => {
  await say("I have an open house at 77 Elm Street, Rockville, MD next Saturday at 11 AM");
  const d = (await store.list("email_drafts", p.id)).find((x) => x.subject.includes("77 Elm Street"))!;
  assert.ok(d);
  assert.ok(!/bed|bath|sq ft|\$/.test(d.body));
  const post = (await store.list("social_posts", p.id)).find((x) => x.caption.includes("77 Elm Street"))!;
  assert.ok(!/bed|bath|sq ft|\$/.test(post.caption));
  assert.ok(post.slides.every((s) => !s.image_id)); // no photos => no fake imagery
});

test("emailing contacts about an open house is optional (off by default) and available on request", async () => {
  p.settings = { ...p.settings, workflows: { email_contacts: false } };
  const before = (await store.list("email_drafts", p.id)).length;
  const o = await say("I have an open house at 456 Oak Lane Friday at 3 PM");
  const wf = blocks(o, "workflow")[0];
  const mail = wf.items.find((i: any) => i.label === "Email contacts");
  assert.equal(mail.state, "skipped");
  assert.equal((await store.list("email_drafts", p.id)).length, before, "no email draft should be made on its own");
  assert.ok(wf.buttons.some((b: any) => /Email my contacts/.test(b.label)));
  const e = await say("Email my contacts about the open house at 456 Oak Lane");
  assert.match(e.milaMessage.content, /drafted an email to \d+ contacts/);
  assert.equal((await store.list("email_drafts", p.id)).length, before + 1);
  assert.ok((await store.list("approvals", p.id)).some((a) => a.status === "pending" && /send/.test(a.action) && /Open House/i.test(a.title + a.summary)), "sending still needs approval");
  p.settings = { ...p.settings, workflows: { email_contacts: true } };
});

test("a bare street address uses the agent's own market instead of quizzing them, and says so", async () => {
  const a = await say("I have an open house at 910 Pine Road Sunday at 2 PM");
  assert.match(a.milaMessage.content, /prepared your open house\. I assumed 910 Pine Road is in Gaithersburg, MD/);
  const prop = (await store.list("properties", p.id)).find((x) => x.address === "910 Pine Road")!;
  assert.equal(prop.city, "Gaithersburg");
  assert.equal(prop.verified, false, "looked-up or typed details stay unconfirmed");
});

test("with no home market on file, Mila asks for the city and state, then carries on", async () => {
  await store.update("profiles", p.id, p.id, { location: "" }); (p as any).location = "";
  const a = await say("I have an open house at 33 Hickory Road Friday at 8 AM");
  assert.match(a.milaMessage.content, /What city and state is 33 Hickory Road in/);
  const b = await say("Frederick, MD");
  assert.match(b.milaMessage.content, /prepared your open house/);
  assert.equal((await store.list("properties", p.id)).find((x) => x.address === "33 Hickory Road")!.city, "Frederick");
  await store.update("profiles", p.id, p.id, { location: "Gaithersburg, MD" }); (p as any).location = "Gaithersburg, MD";
});

test("a full address in one message goes straight through; a ZIP is enough", async () => {
  const a = await say("I have an open house at 14 Birch Court, Bethesda, MD Saturday at 11 AM");
  assert.match(a.milaMessage.content, /prepared your open house/);
  const b = await say("I have an open house at 22 Cedar Drive 20814 Sunday at 4 PM");
  assert.match(b.milaMessage.content, /prepared your open house/);
  assert.equal((await store.list("properties", p.id)).find((x) => x.address === "22 Cedar Drive")!.zip, "20814");
});

test("correcting the day replaces the old day instead of stacking on it", async () => {
  // asks for the time on Sunday…
  const a = await say("Schedule a showing at 456 Oak Lane on Sunday");
  assert.match(a.milaMessage.content, /time/i);
  assert.match(a.milaMessage.content, /Sunday/);
  // …but the agent meant today (Thursday in the test clock)
  const b = await say("sorry, the one for today");
  assert.doesNotMatch(b.milaMessage.content, /Sunday/, "must not keep asking about the old day");
  assert.match(b.milaMessage.content, /time|Thursday|today/i);
  const c = await say("5pm");
  const ev = (await store.list("calendar_events", p.id)).filter((e) => e.kind === "showing" && /456 Oak Lane/.test(e.title)).sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
  assert.ok(ev, c.milaMessage.content);
  assert.equal(new Date(ev.start_at).toISOString(), "2026-10-01T21:00:00.000Z"); // Thursday Oct 1, 5 PM ET
});

test("a new time in the answer replaces the old time too", async () => {
  const a = await say("Schedule a call with John Smith Friday at 2pm");
  assert.ok(a.milaMessage.content);
  const { overrideWhen } = await import("../src/lib/agent/nlu");
  assert.equal(overrideWhen("Lunch with Sarah Johnson Sunday at 1pm", "make it Saturday at 3pm", new Date("2026-10-01T13:00:00Z"), "America/New_York"), "Lunch with Sarah Johnson");
  assert.equal(overrideWhen("open house at 12 Sunset Boulevard Sunday", "today", new Date("2026-10-01T13:00:00Z"), "America/New_York"), "open house at 12 Sunset Boulevard");
});

test("an address Google can't find is flagged, not refused", async () => {
  const realFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = (async () => new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }))) as typeof fetch;
  try {
    const o = await say("I have an open house at 5 Brand New Court, Rockville, MD Tuesday at 6 PM");
    assert.match(o.milaMessage.content, /prepared your open house/, "the open house is still set up");
    assert.doesNotMatch(o.milaMessage.content, /fake|couldn't find/i);
    const item = blocks(o, "workflow")[0].items.find((i: any) => i.label === "Property details");
    assert.equal(item.state, "skipped");
    assert.match(item.detail, /couldn't find this address on the map/);
    const prop = (await store.list("properties", p.id)).find((x) => x.address === "5 Brand New Court")!;
    assert.equal(prop.city, "Rockville");
  } finally { globalThis.fetch = realFetch; delete process.env.GOOGLE_MAPS_API_KEY; }
});
