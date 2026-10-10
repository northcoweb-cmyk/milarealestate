// The "still not done" batch: agreement worksheet + PDF, quick questions, pets, time-off shift, event names, week card, call outcome, reminders.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { makePdf } from "../src/lib/pdf-lite.ts";

const now = new Date("2026-10-05T14:00:00Z");
const tz = "America/New_York";
const fresh = () => newAgent({ now, tz, seed: false });
const text = async (a: any, m: string) => (await a.say(m)).milaMessage.content as string;

test("the PDF writer makes a real, multi-page PDF", () => {
  const b = makePdf(Array.from({ length: 120 }, (_, i) => ({ text: `Line ${i} (with) parens \\ and “quotes”` })));
  assert.equal(b.subarray(0, 5).toString(), "%PDF-");
  assert.match(b.toString("latin1"), /\/Count [2-9]/);
  assert.match(b.toString("latin1"), /%%EOF$/);
});

test("listing agreement: asks first, shows a prefilled worksheet, saves it", async () => {
  const a = await fresh();
  await text(a, "New listing at 22 Elm Court Bethesda MD, 3/2, $650k. Sellers are the Hendersons");
  const r: any = await a.say("I need the listing agreement for 22 Elm Court");
  assert.match(r.milaMessage.content, /worksheet/i);
  const start = r.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => b.action?.type === "listing_worksheet_start");
  assert.ok(start, "offers to fill it out");
  const f: any = await a.act(start.action);
  const q = f.milaMessage.blocks.find((b: any) => b.type === "questions");
  assert.ok(q);
  assert.equal(q.fields.find((x: any) => x.key === "price").value, "$650,000");
  const s: any = await a.act({ type: "listing_worksheet", ...q.context, answers: { commission: "2.5%", term: "180 days" } });
  const pdf = s.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => /agreement-pdf/.test(b.href ?? ""));
  assert.ok(pdf, "links to the PDF");
});

test("new buyer gets the quick-questions card and the answers land on the contact", async () => {
  const a = await fresh();
  const r: any = await a.say("New buyer Priya Shah, priya@example.com");
  const q = r.milaMessage.blocks.find((b: any) => b.type === "questions");
  assert.ok(q, "quick questions card");
  await a.act({ type: "answer_questions", contactId: q.contactId, answers: { budget: "$500k", area: "Rockville, MD", beds: "3", timeline: "3 months" } });
  const c = (await store.list("contacts", a.id)).find((x: any) => x.name === "Priya Shah") as any;
  assert.equal(c.budget_max, 500000);
  assert.equal(c.location, "Rockville, MD");
});

test("out of office: one tap pushes the booked things to the first day back", async () => {
  const a = await fresh();
  await text(a, "Showing at 12 Oak Lane Rockville MD Thursday at 2pm with Dana");
  const r: any = await a.say("I'm out of town Thursday");
  const shift = r.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => b.action?.type === "shift_events");
  assert.ok(shift, "offers to push everything");
  await a.act(shift.action);
  const ev = (await store.list("calendar_events", a.id)).find((e: any) => /Showing/.test(e.title)) as any;
  assert.match(new Date(ev.start_at).toISOString(), /2026-10-09/);
});

test("event titles keep who it is for", async () => {
  const a = await fresh();
  await text(a, "Showing at 12 Oak Lane Rockville MD Friday at 2pm for the Smiths");
  const ev = (await store.list("calendar_events", a.id)).find((e: any) => /Showing/.test(e.title)) as any;
  assert.match(ev.title, /Smiths/);
});

test("pet check goes by what is saved and says what is unknown", async () => {
  const a = await fresh();
  await text(a, "New listing at 22 Elm Court Bethesda MD, 3/2, $650k");
  const r: any = await a.say("Which of my listings are pet friendly?");
  assert.match(r.milaMessage.content, /no pet policy saved|None are recorded/i);
});

test("a logged call comes back as a card with what was saved", async () => {
  const a = await fresh();
  await text(a, "New buyer Priya Shah looking for a 3 bedroom around $500k");
  const r: any = await a.say("I just talked to Priya, she wants to see houses this weekend and I'll send her listings");
  assert.ok(r.milaMessage.blocks.some((b: any) => b.type === "listing_brief" && /call outcome/i.test(b.title)));
});
