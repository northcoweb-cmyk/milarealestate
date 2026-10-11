// Stage B (P0): "cancel the original and replace it with something that overlaps" must be ONE confirmed swap, with the original inactive,
// the unrelated appointments untouched, retries safe, and stale approvals refused. Mocked clock and local store; no live calendar provider.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, store } from "./qa/harness.mts";
import { partsIn } from "../src/lib/time.ts";

const tz = "America/New_York";
const NOW = new Date("2026-10-11T14:00:00Z"); // Sunday 10:00 ET
const fresh = (now = NOW) => newAgent({ now, tz, seed: false });
const events = async (a: any) => (await store.list("calendar_events", a.id)) as any[];
const active = async (a: any) => (await events(a)).filter((e) => e.status === "confirmed");
const btn = (r: any, label: RegExp) => r.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => label.test(b.label));
const approvalId = (r: any) => btn(r, /Confirm replacement/)?.approvalId as string;
const setup = async (a: any) => {
  await a.say("I have an open house at 100 Oak Street Arlington VA Saturday from 1-3");
  return (await events(a)).find((e) => /Oak/.test(e.title));
};

test("1. cancel Oak and replace with Pine at an overlapping time: preview first, nothing changes until confirmed, then the original is inactive", async () => {
  const a = await fresh();
  const oak = await setup(a);
  const r = await a.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 2-4");
  assert.ok(approvalId(r), "a preview with a confirm button");
  assert.match(r.milaMessage.blocks.find((b: any) => b.type === "notice").body, /Cancel: Open House — 100 Oak[\s\S]*Add: Open House — 200 Pine/);
  assert.equal((await active(a)).length, 1, "nothing changed yet");
  assert.equal((await store.list("properties", a.id)).some((p: any) => /Pine/.test(p.address)), false, "the new address is not saved before confirming");
  const done = await a.act({ type: "approve", id: approvalId(r) });
  assert.match(done.milaMessage.content, /Replaced Open House — 100 Oak Street with Open House — 200 Pine Street/);
  const act = await active(a);
  assert.equal(act.length, 1);
  assert.match(act[0].title, /Pine/);
  assert.equal((await events(a)).find((e) => e.id === oak.id).status, "cancelled", "the original is no longer active");
  assert.equal((await store.list("properties", a.id)).some((p: any) => /Pine/.test(p.address)), true, "saved after confirming");
});

test("2. a typed yes confirms exactly that preview; a stray yes with nothing pending confirms nothing", async () => {
  const a = await fresh();
  await setup(a);
  const stray = await a.say("yes");
  assert.doesNotMatch(stray.milaMessage.content, /Replaced|Canceled|Done/);
  await a.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday 2-4");
  const yes = await a.say("yes");
  assert.match(yes.milaMessage.content, /Replaced/);
  assert.equal((await active(a)).length, 1);
});

test("3. same property, new time: replaced at the new time, no duplicate property", async () => {
  const a = await fresh();
  const oak = await setup(a);
  const r = await a.say("Cancel the Oak open house and replace it with an open house Saturday at 4");
  await a.act({ type: "approve", id: approvalId(r) });
  const act = await active(a);
  assert.equal(act.length, 1);
  assert.match(act[0].title, /Oak/);
  const p = partsIn(new Date(act[0].start_at), tz);
  assert.deepEqual([p.h, p.mi], [16, 0]);
  assert.equal(act[0].property_id, oak.property_id, "same home");
  assert.equal((await store.list("properties", a.id)).filter((x: any) => /Oak/.test(x.address)).length, 1);
});

test("4. an unrelated overlapping appointment is never deleted, and replacing over it needs an explicit choice", async () => {
  const a = await fresh();
  await setup(a);
  await a.say("lunch Saturday at 3:30 with Mark");
  const r = await a.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 3-5");
  assert.match(r.milaMessage.content, /overlaps Lunch/i);
  assert.equal((await active(a)).length, 2, "nothing changed");
  assert.equal(approvalId(r), undefined, "no approval is even offered while it overlaps");
  const any = btn(r, /Replace anyway/);
  assert.ok(any && btn(r, /Find another time/) && btn(r, /Never mind/));
  const prev = await a.act(any.action);
  const done = await a.act({ type: "approve", id: approvalId(prev) });
  assert.match(done.milaMessage.content, /Replaced/);
  const act = await active(a);
  assert.deepEqual(act.map((e) => e.title.split(" ")[0]).sort(), ["Lunch", "Open"], "lunch is still there");
});

test("5. two similar open houses: Mila asks which one and never guesses", async () => {
  const a = await fresh();
  await a.say("I have an open house at 100 Oak Street Arlington VA Saturday from 1-3");
  await a.say("I have an open house at 300 Elm Street Arlington VA Sunday from 1-3");
  const r = await a.say("Cancel the open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 4-6");
  assert.match(r.milaMessage.content, /Which one/i);
  assert.equal((await active(a)).length, 2);
  const elm = r.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => /Elm/.test(b.label));
  const prev = await a.act(elm.action);
  await a.act({ type: "approve", id: approvalId(prev) });
  const titles = (await active(a)).map((e) => e.title);
  assert.ok(titles.some((t) => /Oak/.test(t)) && titles.some((t) => /Pine/.test(t)) && !titles.some((t) => /Elm/.test(t)));
});

test("6. a correction after the preview changes THAT swap: old approval is void, exactly one replacement exists", async () => {
  const a = await fresh();
  await setup(a);
  const r1 = await a.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 2-4");
  const first = approvalId(r1);
  const r2 = await a.say("Actually Monday 1 to 3");
  const second = approvalId(r2);
  assert.ok(second && second !== first);
  const pend = (await store.list("approvals", a.id)).filter((x: any) => x.status === "pending" && x.payload.tool === "replace_calendar_event");
  assert.equal(pend.length, 1, "the old approval was superseded");
  const old = await a.act({ type: "approve", id: first });
  assert.match(old.milaMessage.content, /already handled/i);
  await a.act({ type: "approve", id: second });
  const act = await active(a);
  assert.equal(act.length, 1);
  assert.equal(partsIn(new Date(act[0].start_at), tz).d, 12, "Monday Oct 12");
});

test("7. retries and two tabs: approving twice (even at once) creates exactly one replacement", async () => {
  const a = await fresh();
  await setup(a);
  const r = await a.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 2-4");
  const id = approvalId(r);
  await Promise.all([a.act({ type: "approve", id }), a.act({ type: "approve", id })]);
  await a.act({ type: "approve", id });
  assert.equal((await active(a)).length, 1);
  assert.equal((await events(a)).filter((e) => /Pine/.test(e.title) && e.status === "confirmed").length, 1);
});

test("8. stale approval: the original was edited or canceled after the preview, so nothing changes", async () => {
  const a = await fresh();
  const oak = await setup(a);
  const r = await a.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 2-4");
  await store.update("calendar_events", a.id, oak.id, { title: "Open House — 100 Oak Street (edited)" });
  const out = await a.act({ type: "approve", id: approvalId(r) });
  assert.match(out.milaMessage.content, /edited after|haven't changed anything|didn't go through/i);
  const act = await active(a);
  assert.equal(act.length, 1);
  assert.match(act[0].title, /Oak/);
  const a2 = await fresh();
  const oak2 = await setup(a2);
  const r2 = await a2.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 2-4");
  await store.update("calendar_events", a2.id, oak2.id, { status: "cancelled" }); // deleted somewhere else
  const out2 = await a2.act({ type: "approve", id: approvalId(r2) });
  assert.match(out2.milaMessage.content, /already changed or is gone|haven't changed anything|didn't go through/i);
  assert.equal((await active(a2)).length, 0, "no replacement was invented");
});

test("9. if the replacement cannot be created the original stays; if the cancel cannot be saved the replacement is rolled back", async () => {
  const a = await fresh();
  const oak = await setup(a);
  const r = await a.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 2-4");
  const realInsert = store.insert.bind(store);
  store.insert = async (table: string, ...rest: any[]) => { if (table === "calendar_events") throw new Error("provider timeout"); return realInsert(table, ...rest); };
  await a.act({ type: "approve", id: approvalId(r) }).catch(() => undefined);
  store.insert = realInsert;
  assert.equal((await events(a)).find((e) => e.id === oak.id).status, "confirmed", "creation failed, original untouched");
  assert.equal((await active(a)).length, 1);

  const b = await fresh();
  const oak2 = await setup(b);
  const rb = await b.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 2-4");
  const realUpdate = store.update.bind(store);
  store.update = async (table: string, uid: string, id: string, patch: any) => { if (table === "calendar_events" && id === oak2.id && patch?.status === "cancelled") throw new Error("write failed"); return realUpdate(table, uid, id, patch); };
  const out = await b.act({ type: "approve", id: approvalId(rb) });
  store.update = realUpdate;
  assert.match(out.milaMessage.content, /Nothing changed|didn't go through|couldn't cancel/i);
  const act = await active(b);
  assert.equal(act.length, 1, "never both active, never none");
  assert.match(act[0].title, /Oak/);
});

test("10. across the November DST change the new event is still at the requested local time", async () => {
  const now = new Date("2026-10-28T14:00:00Z");
  const a = await fresh(now);
  await a.say("I have an open house at 100 Oak Street Arlington VA Saturday October 31 from 1-3");
  const r = await a.say("Cancel the Oak open house and replace it with an open house Sunday November 1 from 1-3");
  await a.act({ type: "approve", id: approvalId(r) });
  const act = await active(a);
  assert.equal(act.length, 1);
  const p = partsIn(new Date(act[0].start_at), tz);
  assert.deepEqual([p.m, p.d, p.h], [11, 1, 13]);
  assert.equal(new Date(act[0].start_at).toISOString(), "2026-11-01T18:00:00.000Z", "EST after the change");
});

test("11. late-night rollover: 'tomorrow' after 11pm means the next calendar day", async () => {
  const now = new Date("2026-10-12T03:50:00Z"); // Sunday 11:50 PM ET
  const a = await fresh(now);
  await a.say("I have an open house at 100 Oak Street Arlington VA Saturday from 1-3");
  const r = await a.say("Cancel the Oak open house and replace it with an open house tomorrow at 9 am");
  assert.ok(approvalId(r));
  await a.act({ type: "approve", id: approvalId(r) });
  const p = partsIn(new Date((await active(a))[0].start_at), tz);
  assert.deepEqual([p.m, p.d, p.h], [10, 12, 9], "Monday, not Tuesday");
});

test("12. undo restores the original and cancels the replacement, unless something else now overlaps", async () => {
  const a = await fresh();
  const oak = await setup(a);
  const r = await a.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 2-4");
  await a.act({ type: "approve", id: approvalId(r) });
  const u = await a.say("undo");
  assert.match(u.milaMessage.content, /Undone/);
  const act = await active(a);
  assert.equal(act.length, 1);
  assert.equal(act[0].id, oak.id);
});

test("13. 'never mind' declines the preview and leaves the calendar alone", async () => {
  const a = await fresh();
  await setup(a);
  const r = await a.say("Cancel the Oak open house and replace it with an open house at 200 Pine Street Arlington VA Saturday from 2-4");
  const no = await a.say("no");
  assert.match(no.milaMessage.content, /won't do that/i);
  assert.equal((await active(a)).length, 1);
  const late = await a.act({ type: "approve", id: approvalId(r) });
  assert.match(late.milaMessage.content, /already handled/i);
  assert.match((await active(a))[0].title, /Oak/);
});

test("14. a plain cancel (no replacement) still cancels only the named event", async () => {
  const a = await fresh();
  await setup(a);
  await a.say("showing at 55 Birch Road Arlington VA Saturday at 5pm");
  const r = await a.say("cancel the Oak open house");
  const conf = r.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => b.approvalId);
  await a.act({ type: "approve", id: conf.approvalId });
  const act = await active(a);
  assert.equal(act.length, 1);
  assert.match(act[0].title, /Showing/);
});
