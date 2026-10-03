// ~300 realistic multi-turn conversations, each with a specific correct OUTCOME (not just "didn't crash").
// Deterministic: seeded generator; each conversation gets its own fresh account, time zone and "now".
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, pick, rng, store, ZONES, type Agent } from "./qa/harness.mts";
import { addDays, partsIn, zonedToUtc } from "../src/lib/time.ts";

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STREETS = ["Brookside Drive", "Maple Avenue", "Cedar Court", "Willow Lane", "Birch Road", "Lakeview Terrace", "Hillcrest Way", "Orchard Street", "Sycamore Boulevard", "Park Place"];
const CITIES: [string, string][] = [["Rockville", "MD"], ["Bethesda", "MD"], ["Frederick", "MD"], ["Arlington", "VA"], ["Austin", "TX"], ["Denver", "CO"], ["Tampa", "FL"], ["Phoenix", "AZ"]];

function baseNow(r: () => number) { return new Date(Date.UTC(2026, 9, 1) + Math.floor(r() * 21) * 86_400_000 + Math.floor((13 + r() * 6) * 3_600_000)); } // mid-morning-ish US, any day
/** the next date (after today) that falls on weekday `dow` in tz, at h:mi local */
function nextDow(now: Date, tz: string, dow: number, h: number, mi = 0) {
  for (let i = 1; i <= 7; i++) { const d = addDays(now, i, tz); const p = partsIn(d, tz); if (p.dow === dow) return zonedToUtc(p.y, p.m, p.d, h, mi, tz); }
  throw new Error("no date");
}
const todayDow = (now: Date, tz: string) => partsIn(now, tz).dow;
const fresh = (r: () => number) => { const tz = pick(r, ZONES); return newAgent({ now: baseNow(r), tz, seed: false }); };
const evs = async (a: Agent, kind?: string) => (await store.list("calendar_events", a.id)).filter((e: any) => e.status === "confirmed" && (!kind || e.kind === kind));
const hhmm = (iso: string, tz: string) => { const p = partsIn(new Date(iso), tz); return `${p.h}:${String(p.mi).padStart(2, "0")}`; };
const say = async (a: Agent, m: string) => (await a.say(m)).milaMessage.content as string;
const problems: string[] = [];
const check = (cond: boolean, id: string, why: string, a?: Agent) => { if (!cond) problems.push(`${id}: ${why}\n      ${(a?.log ?? []).slice(-6).join("\n      ")}`); };

// ---------------------------------------------------------------- A. listing entry (60)
test("A. listing entry: every way an agent types a listing is saved fully, without questions", async () => {
  const r = rng(101);
  for (let i = 0; i < 60; i++) {
    const a = await fresh(r);
    const num = 100 + Math.floor(r() * 9800), street = pick(r, STREETS), [city, st] = pick(r, CITIES);
    const beds = 2 + Math.floor(r() * 4), baths = pick(r, [1, 1.5, 2, 2.5, 3]), price = pick(r, [325000, 399900, 475000, 589000, 650000, 875000, 1250000]);
    const sq = pick(r, [0, 1450, 1980, 2400, 3150]);
    const priceTxt = pick(r, [`$${price.toLocaleString("en-US")}`, `listed at $${price.toLocaleString("en-US")}`, price % 1000 === 0 && price < 1000000 ? `$${price / 1000}k` : `$${price.toLocaleString("en-US")}`, price >= 1000000 ? `$${(price / 1e6).toFixed(2).replace(/0$/, "")}M` : `asking ${price / 1000}k`]);
    const bbTxt = pick(r, [`${beds} bed ${baths} bath`, `${beds}br ${baths}ba`, `${beds} bedroom, ${baths} bathroom`, Number.isInteger(baths) ? `${beds}/${baths}` : `${beds} bd ${baths} ba`]);
    const lead = pick(r, ["I just got a new listing at", "New listing:", "Add my listing", "I signed a listing at", "Just listed"]);
    const msg = `${lead} ${num} ${street}, ${city} ${st}. ${bbTxt}, ${priceTxt}${sq ? `, ${sq.toLocaleString("en-US")} sq ft` : ""}`;
    const out = await say(a, msg);
    const [p] = await store.list("properties", a.id);
    const id = `A${i} "${msg}"`;
    check(!!p, id, "no property saved", a);
    if (!p) continue;
    check(p.beds === beds, id, `beds ${p.beds} != ${beds}`, a);
    check(p.baths === baths, id, `baths ${p.baths} != ${baths}`, a);
    check(p.list_price === price, id, `price ${p.list_price} != ${price}`, a);
    if (sq) check(p.sqft === sq, id, `sqft ${p.sqft} != ${sq}`, a);
    check(p.city === city && p.state === st, id, `place ${p.city},${p.state}`, a);
    check(!/\?\s*$/m.test(out.split("\n")[0]), id, "asked a question instead of saving", a);
  }
});

// ---------------------------------------------------------------- B. book, correct, cancel (60)
test("B. showings: booking, changing the time, changing the day, cancelling all land on the right slot", async () => {
  const r = rng(202);
  for (let i = 0; i < 60; i++) {
    const a = await fresh(r);
    const tz = a.tz, now = a.now;
    const dows = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== todayDow(now, tz));
    const d1 = pick(r, dows), d2 = pick(r, dows.filter((d) => d !== d1));
    const h1 = 9 + Math.floor(r() * 8), h2 = 9 + Math.floor(r() * 8);
    const addr = `${200 + Math.floor(r() * 700)} ${pick(r, STREETS)}`;
    const id = `B${i}`;
    const ampm = (h: number) => `${h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}`;
    await say(a, pick(r, [`Showing at ${addr} ${DOW[d1]} at ${ampm(h1)}`, `Schedule a showing at ${addr} on ${DOW[d1]} at ${ampm(h1)}`, `Book a showing for ${DOW[d1]} ${ampm(h1)} at ${addr}`]));
    let e = (await evs(a, "showing"))[0];
    check(!!e && hhmm(e.start_at, tz) === `${h1}:00` && partsIn(new Date(e.start_at), tz).dow === d1, id, `booked wrong: ${e?.start_at}`, a);
    const mode = pick(r, ["time", "day", "cancel", "both"]);
    if (mode === "time" || mode === "both") await say(a, pick(r, [`Actually make that ${ampm(h2)}`, `Change the showing to ${ampm(h2)}`, `Move the showing at ${addr} to ${ampm(h2)}`]));
    if (mode === "day" || mode === "both") await say(a, pick(r, [`Actually move it to ${DOW[d2]}`, `Move the showing at ${addr} to ${DOW[d2]}`]));
    if (mode === "cancel") await say(a, `Cancel the showing at ${addr}`);
    const all = await evs(a, "showing");
    if (mode === "cancel") { check(all.length === 0 || /approval|confirm/i.test(a.log.join(" ")), id, "cancel did not remove event", a); continue; }
    e = all[0];
    check(all.length === 1, id, `expected 1 showing, got ${all.length}`, a);
    if (!e) continue;
    const wantH = mode === "day" ? h1 : h2, wantD = mode === "time" ? d1 : d2;
    const pe = partsIn(new Date(e.start_at), tz);
    check(pe.dow === wantD, id, `day ${DOW[pe.dow]} != ${DOW[wantD]}`, a);
    check(`${pe.h}:${String(pe.mi).padStart(2, "0")}` === `${wantH}:00`, id, `time ${pe.h}:${pe.mi} != ${wantH}:00`, a);
  }
});

// ---------------------------------------------------------------- C. interruptions (50)
test("C. an open question never swallows a different request, and answering later still works", async () => {
  const r = rng(303);
  for (let i = 0; i < 50; i++) {
    const a = await fresh(r);
    const d = pick(r, [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== todayDow(a.now, a.tz)));
    const id = `C${i}`;
    const q = await say(a, pick(r, [`Schedule an inspection for ${DOW[d]}`, `Book a closing ${DOW[d]}`, `Put a meeting on ${DOW[d]}`]));
    check(/what time/i.test(q), id, `expected a time question, got: ${q}`, a);
    const interject = pick(r, [["Remind me to call Dana tomorrow at 9 AM", /remind/i], ["I have a new buyer named Priya Shah looking for a 3 bedroom around $500k", /Priya/i], ["Who should I follow up with today?", /need you|everything|follow|nothing/i], ["What can you do?", /./]]);
    const out = await say(a, interject[0] as string);
    check(!/what time (on|does)/i.test(out) || /remind|Priya/i.test(out), id, `stale question swallowed "${interject[0]}": ${out}`, a);
    check((interject[1] as RegExp).test(out), id, `unexpected reply to "${interject[0]}": ${out.slice(0, 120)}`, a);
    if (i % 2 === 0) { // and the agent can still finish the original later
      const fin = await say(a, `${DOW[d]} at 2 PM inspection`);
      check(!/not sure|what time on/i.test(fin), id, `could not finish original: ${fin}`, a);
    }
  }
});

// ---------------------------------------------------------------- D. client facts (40)
test("D. what the agent says about a client is saved to that client, once", async () => {
  const r = rng(404);
  for (let i = 0; i < 40; i++) {
    const a = await fresh(r);
    const name = pick(r, ["Dana Whitfield", "Marcus Lee", "Priya Shah", "Tom Alvarez", "Grace Kim"]);
    const first = name.split(" ")[0];
    await a.say(`I have a new buyer named ${name} looking for a 3 bedroom around $600k`);
    const facts: [string, RegExp][] = [
      [`${first} wants a big backyard and a garage`, /backyard/i],
      [`${first} has two kids and a dog`, /kids|dog/i],
      [`${first} is worried about interest rates`, /rates/i],
    ];
    const [msg, re] = pick(r, facts);
    const out = await say(a, msg);
    const c = (await store.list("contacts", a.id))[0];
    const mem = (await store.list("memories", a.id)).filter((m: any) => m.subject_id === c?.id);
    const id = `D${i} "${msg}"`;
    check(/Saved to .* profile/.test(out), id, `no acknowledgement: ${out.slice(0, 100)}`, a);
    check(mem.some((m: any) => re.test(m.value)), id, "fact not stored on the client", a);
    const n = mem.length;
    await a.say(msg);
    check((await store.list("memories", a.id)).filter((m: any) => m.subject_id === c?.id).length === n, id, "repeat created a duplicate", a);
    check((await store.list("contacts", a.id)).length === 1, id, "created a second contact", a);
  }
});

// ---------------------------------------------------------------- E. time off (30)
test("E. time off blocks exactly the days said", async () => {
  const r = rng(505);
  for (let i = 0; i < 30; i++) {
    const a = await fresh(r);
    const d = pick(r, [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== todayDow(a.now, a.tz)));
    const msg = pick(r, [`I'm out of town ${DOW[d]}`, `I will be on vacation ${DOW[d]}`, `Taking ${DOW[d]} off`, `I'm unavailable ${DOW[d]}`]);
    const out = await say(a, msg);
    const e = (await evs(a)).find((x: any) => x.title === "Out of office");
    const id = `E${i} "${msg}"`;
    check(!!e, id, `no out-of-office block: ${out.slice(0, 100)}`, a);
    if (e) check(partsIn(new Date(e.start_at), a.tz).dow === d, id, `blocked ${DOW[partsIn(new Date(e.start_at), a.tz).dow]}`, a);
  }
});

// ---------------------------------------------------------------- F. open house times (40)
test("F. open houses understand ranges, bare hours and day names", async () => {
  const r = rng(606);
  for (let i = 0; i < 40; i++) {
    const a = await fresh(r);
    const d = pick(r, [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== todayDow(a.now, a.tz)));
    const [h1, h2, txt] = pick(r, [[13, 15, "1-3"], [11, 13, "11-1"], [12, 14, "12-2"], [14, 16, "2 to 4"], [10, 12, "10am-12pm"], [13, 16, "1-4 PM"]] as [number, number, string][]);
    const [city, st] = pick(r, CITIES);
    const addr = `${300 + Math.floor(r() * 600)} ${pick(r, STREETS)}`;
    const msg = `Open house at ${addr}, ${city} ${st} ${DOW[d]} ${txt}`;
    const out = await say(a, msg);
    const e = (await evs(a, "open_house"))[0];
    const id = `F${i} "${msg}"`;
    check(!!e, id, `no open house: ${out.slice(0, 100)}`, a);
    if (!e) continue;
    const ps = partsIn(new Date(e.start_at), a.tz), pe = partsIn(new Date(e.end_at), a.tz);
    check(ps.h === h1 && pe.h === h2 && ps.dow === d, id, `got ${DOW[ps.dow]} ${ps.h}-${pe.h}, wanted ${DOW[d]} ${h1}-${h2}`, a);
  }
});

// ---------------------------------------------------------------- G. several things in one message (20)
test("G. several bookings in one message all happen", async () => {
  const r = rng(707);
  for (let i = 0; i < 20; i++) {
    const a = await fresh(r);
    const d = pick(r, [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== todayDow(a.now, a.tz)));
    const h1 = pick(r, [9, 10, 11]), h2 = pick(r, [14, 15, 16]);
    const msg = pick(r, [`Book a showing ${DOW[d]} at ${h1} AM and another ${DOW[d]} at ${h2 - 12} PM`, `Schedule a showing ${DOW[d]} at ${h1} AM; schedule a call ${DOW[d]} at ${h2 - 12} PM`]);
    await say(a, msg);
    const all = await evs(a);
    check(all.length === 2, `G${i} "${msg}"`, `expected 2 events, got ${all.length}`, a);
  }
});

test("conversation suite: zero failures", () => {
  if (problems.length) console.error(`\n${problems.length} conversation failures:\n` + problems.slice(0, 40).map((p) => " - " + p).join("\n"));
  assert.equal(problems.length, 0, `${problems.length} conversations produced the wrong outcome`);
});
