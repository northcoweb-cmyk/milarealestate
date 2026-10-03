// Second conversation suite: ~350 NEW realistic conversations the way agents really type (fast, slang, typos, run-ons, odd formats).
// Every scenario runs on a fresh account with its own random clock + time zone and asserts a specific OUTCOME (saved data / calendar slot /
// reply content). Deterministic: seeded generators only.
import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, pick, rng, store, ZONES, type Agent } from "./qa/harness.mts";
import { addDays, partsIn, zonedToUtc } from "../src/lib/time.ts";

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** a random "now": any day from October to March (covers month/year wrap and both DST changes), 7-9 AM local so every daytime slot is still ahead */
function clock(r: () => number, tz = pick(r, ZONES)) {
  const base = new Date(Date.UTC(2026, 9, 1) + Math.floor(r() * 170) * 86_400_000);
  const p = partsIn(base, tz);
  return { tz, now: zonedToUtc(p.y, p.m, p.d, 7 + Math.floor(r() * 3), Math.floor(r() * 60), tz) };
}
const fresh = async (r: () => number, seed = false) => { const c = clock(r); return newAgent({ now: c.now, tz: c.tz, seed }); };
const dayPlus = (a: Agent, n: number) => addDays(a.now, n, a.tz);
/** the next date strictly after today that falls on `dow` */
const nextDow = (a: Agent, dow: number) => { for (let i = 1; i <= 7; i++) { const d = dayPlus(a, i); if (partsIn(d, a.tz).dow === dow) return d; } throw new Error("dow"); };
/** "next Tues" = that weekday in the following Sunday-to-Saturday week */
const nextWeekDow = (a: Agent, dow: number) => dayPlus(a, 7 - partsIn(a.now, a.tz).dow + dow);
const notToday = (a: Agent, r: () => number) => pick(r, [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== partsIn(a.now, a.tz).dow));

const evs = async (a: Agent, kind?: string) => (await store.list("calendar_events", a.id)).filter((e: any) => e.status === "confirmed" && (!kind || e.kind === kind)).sort((x: any, y: any) => x.start_at.localeCompare(y.start_at));
const ymd = (d: Date | string, tz: string) => { const p = partsIn(new Date(d), tz); return `${p.y}-${p.m}-${p.d}`; };
const hm = (d: Date | string, tz: string) => { const p = partsIn(new Date(d), tz); return `${p.h}:${String(p.mi).padStart(2, "0")}`; };
const say = async (a: Agent, m: string) => (await a.say(m)).milaMessage.content as string;
const sayFull = async (a: Agent, m: string) => { const r = await a.say(m); return { text: r.milaMessage.content as string, blocks: r.milaMessage.blocks as any[], all: r.milaMessage.content + " " + JSON.stringify(r.milaMessage.blocks) }; };
const qCount = (s: string) => (s.match(/\?/g) ?? []).length;

let total = 0;
const problems: string[] = [];
async function scenario(id: string, a: Agent, body: (bad: (cond: boolean, why: string) => void) => Promise<void>) {
  total++;
  const bad = (cond: boolean, why: string) => { if (!cond) problems.push(`${id}: ${why}\n      ${a.log.slice(-6).join("\n      ")}`); };
  try { await body(bad); } catch (e: any) { problems.push(`${id}: EXCEPTION ${(e?.stack ?? e).toString().split("\n").slice(0, 3).join(" | ")}\n      ${a.log.slice(-4).join("\n      ")}`); }
}
function slotIs(bad: (c: boolean, w: string) => void, a: Agent, e: any, day: Date, h: number, mi = 0) {
  bad(!!e, "no event created");
  if (!e) return;
  bad(ymd(e.start_at, a.tz) === ymd(day, a.tz), `date ${ymd(e.start_at, a.tz)} != ${ymd(day, a.tz)}`);
  bad(hm(e.start_at, a.tz) === `${h}:${String(mi).padStart(2, "0")}`, `time ${hm(e.start_at, a.tz)} != ${h}:${String(mi).padStart(2, "0")}`);
}

// ======================================================================= A. listings in odd formats (36)
interface L { msg: string; address: string; city?: string; state?: string; zip?: string; beds?: number; baths?: number; price?: number; sqft?: number; seller?: string }
const LISTINGS: L[] = [
  { msg: "New listing at 8814 Brookside Drive, Rockville MD. 4 bed 3 bath, $875,000", address: "8814 Brookside Drive", city: "Rockville", state: "MD", beds: 4, baths: 3, price: 875000 },
  { msg: "I just got a new listing, 12 Oak St #4B, Bethesda MD. 2bd/2ba, $1.15M", address: "12 Oak Street #4B", city: "Bethesda", state: "MD", beds: 2, baths: 2, price: 1150000 },
  { msg: "just listed 1420 N Pine Ridge Rd, Frederick MD 4bd/2.5ba $1.15M", address: "1420 N Pine Ridge Road", city: "Frederick", state: "MD", beds: 4, baths: 2.5, price: 1150000 },
  { msg: "new listing 77 W. Montgomery Ave Rockville MD 3 bed 2 bath 1,850sf asking 899", address: "77 W Montgomery Avenue", city: "Rockville", state: "MD", beds: 3, baths: 2, price: 899000, sqft: 1850 },
  { msg: "got a listing! 300 S Main St, Austin TX - 3/2 - $425k - 1,600 sq ft", address: "300 S Main Street", city: "Austin", state: "TX", beds: 3, baths: 2, price: 425000, sqft: 1600 },
  { msg: "signed a listing at 5 Elm Ct. Denver CO 5 bedrooms 4 bathrooms $2.3M", address: "5 Elm Court", city: "Denver", state: "CO", beds: 5, baths: 4, price: 2300000 },
  { msg: "new listing at 9100 Old Georgetown Rd Bethesda MD asking $1,495,000 4 bd 3.5 ba 3,200 sf", address: "9100 Old Georgetown Road", city: "Bethesda", state: "MD", beds: 4, baths: 3.5, price: 1495000, sqft: 3200 },
  { msg: "New listing: 410 NE 5th St Apt 12, Tampa FL. 1 bed 1 bath $289,900", address: "410 NE 5th Street #12", city: "Tampa", state: "FL", beds: 1, baths: 1, price: 289900 },
  { msg: "new listing 15 Ridgeway Pl, Phoenix AZ, listed at 549k, 3br 2ba", address: "15 Ridgeway Place", city: "Phoenix", state: "AZ", beds: 3, baths: 2, price: 549000 },
  { msg: "ADD LISTING 2200 SOUTHWEST BLVD Tampa FL $615,000 3BR/2BA", address: "2200 Southwest Boulevard", city: "Tampa", state: "FL", beds: 3, baths: 2, price: 615000 },
  { msg: "new listing 4417 E Camelback Rd Phoenix AZ 85018 4bd 3ba 2,900 sqft $1.9M", address: "4417 E Camelback Road", city: "Phoenix", state: "AZ", zip: "85018", beds: 4, baths: 3, price: 1900000, sqft: 2900 },
  { msg: "I listed 18 Cherry Hill Ln Frederick MD for 399,000 - 3 bed 2.5 bath", address: "18 Cherry Hill Lane", city: "Frederick", state: "MD", beds: 3, baths: 2.5, price: 399000 },
  { msg: "New listing at 61 Lakeview Terrace, Arlington VA. Sellers are the Hendersons. 4 bed 3 bath $725k", address: "61 Lakeview Terrace", city: "Arlington", state: "VA", beds: 4, baths: 3, price: 725000, seller: "Hendersons" },
  { msg: "new listing 3 bed 2 bath 1,200 sq ft at 87 Willow Way Rockville MD $335,000", address: "87 Willow Way", city: "Rockville", state: "MD", beds: 3, baths: 2, price: 335000, sqft: 1200 },
  { msg: "new listing 3bed 2bath $410k 23 Birch Rd", address: "23 Birch Road", state: "MD", beds: 3, baths: 2, price: 410000 },
  { msg: "Just listed: 1 bedroom condo 700 Park Place #1203 Arlington VA $349k", address: "700 Park Place #1203", city: "Arlington", state: "VA", beds: 1, price: 349000 },
  { msg: "listing at 1010 Cedar Court, Denver, CO 80202 asking 1.05M 4/3", address: "1010 Cedar Court", city: "Denver", state: "CO", zip: "80202", beds: 4, baths: 3, price: 1050000 },
  { msg: "New listing!! 2501 Sycamore Blvd Austin TX 78701 - 3 bd, 2 ba, 1,725 sq. ft., $1,085,000", address: "2501 Sycamore Boulevard", city: "Austin", state: "TX", zip: "78701", beds: 3, baths: 2, price: 1085000, sqft: 1725 },
  { msg: "new listing 45 Orchard Street, Tampa FL. 2br. 1ba. 675 sf. $199k", address: "45 Orchard Street", city: "Tampa", state: "FL", beds: 2, baths: 1, price: 199000, sqft: 675 },
  { msg: "$725,000 4 bed 3 bath new listing at 8 Hillcrest Way Frederick MD", address: "8 Hillcrest Way", city: "Frederick", state: "MD", beds: 4, baths: 3, price: 725000 },
  { msg: "Got a new listing at 1600 Penn Ave NW, Bethesda MD, 6 bd 5 ba, $12M", address: "1600 Penn Avenue NW", city: "Bethesda", state: "MD", beds: 6, baths: 5, price: 12000000 },
  { msg: "new listing: 22 Maple Ave., Rockville, MD 20850. $499,000. 3 beds, 2 baths.", address: "22 Maple Avenue", city: "Rockville", state: "MD", zip: "20850", beds: 3, baths: 2, price: 499000 },
  { msg: "new listing 120 Main Street, Frederick MD, 3/1.5, 1,400 sqft, $289k", address: "120 Main Street", city: "Frederick", state: "MD", beds: 3, baths: 1.5, price: 289000, sqft: 1400 },
  { msg: "NEW LISTING 5 OAK ST FREDERICK MD 3BR 2BA $300K", address: "5 Oak Street", city: "Frederick", state: "MD", beds: 3, baths: 2, price: 300000 },
  { msg: "new listing - 801 Pine St, Denver CO - $6.5M - 7 bd 8 ba", address: "801 Pine Street", city: "Denver", state: "CO", beds: 7, baths: 8, price: 6500000 },
  { msg: "i got a new listing at 33 Bay Dr, Tampa FL its a 3/2 listed at 475", address: "33 Bay Drive", city: "Tampa", state: "FL", beds: 3, baths: 2, price: 475000 },
  { msg: "new listing 600 N Michigan Ave, Chicago IL 60611, 2 bed 2 bath, $750,000", address: "600 N Michigan Avenue", city: "Chicago", state: "IL", zip: "60611", beds: 2, baths: 2, price: 750000 },
  { msg: "new listng 44 Pine Rd Austin TX 3bd 2ba $350k", address: "44 Pine Road", city: "Austin", state: "TX", beds: 3, baths: 2, price: 350000 },
  { msg: "New listing 88a Lakeview Ln, Rockville MD, 4 bed 2 bath, priced at $615k", address: "88A Lakeview Lane", city: "Rockville", state: "MD", beds: 4, baths: 2, price: 615000 },
  { msg: "new listing, 6 O'Brien Way Bethesda MD, 3 bedroom 2 bathroom, $780,000", address: "6 O'Brien Way", city: "Bethesda", state: "MD", beds: 3, baths: 2, price: 780000 },
  { msg: "just got a new listing 17 St. Mary's Rd Frederick MD 2 bed 1 bath 950 sqft $229k", address: "17 St. Mary's Road", city: "Frederick", state: "MD", beds: 2, baths: 1, price: 229000, sqft: 950 },
  { msg: "new listing: 1200 n. oak dr, Phoenix AZ. 4br/3ba. asking $1.275M. 2,650 sqft", address: "1200 N Oak Drive", city: "Phoenix", state: "AZ", beds: 4, baths: 3, price: 1275000, sqft: 2650 },
  { msg: "new listing 55 sw main st unit 7 Denver CO 2bd 2ba $515k", address: "55 SW Main Street #7", city: "Denver", state: "CO", beds: 2, baths: 2, price: 515000 },
  { msg: "I signed a new listing! 9 Fox Run Dr, Arlington VA. Owners are Dana and Tom Lee. 3 bed 2.5 bath $865k", address: "9 Fox Run Drive", city: "Arlington", state: "VA", beds: 3, baths: 2.5, price: 865000, seller: "Dana and Tom Lee" },
  { msg: "new listing 3 Birch Ct. Rockville MD $1,000,000 flat 5 bed 4 bath 4,100 square feet", address: "3 Birch Court", city: "Rockville", state: "MD", beds: 5, baths: 4, price: 1000000, sqft: 4100 },
];
test("A. listings typed in odd formats are saved complete, in one message, with nothing to fill in", async () => {
  const r = rng(9001);
  for (const [i, L] of LISTINGS.entries()) {
    const a = await fresh(r);
    await scenario(`A${i} "${L.msg}"`, a, async (bad) => {
      const out = await say(a, L.msg);
      const props = await store.list("properties", a.id);
      bad(props.length === 1, `${props.length} properties saved`);
      const p = props[0]; if (!p) return;
      bad(p.address === L.address, `address "${p.address}" != "${L.address}"`);
      if (L.city) bad(p.city === L.city, `city ${p.city} != ${L.city}`);
      if (L.state) bad(p.state === L.state, `state ${p.state} != ${L.state}`);
      if (L.zip) bad(p.zip === L.zip, `zip ${p.zip} != ${L.zip}`);
      if (L.beds != null) bad(p.beds === L.beds, `beds ${p.beds} != ${L.beds}`);
      if (L.baths != null) bad(p.baths === L.baths, `baths ${p.baths} != ${L.baths}`);
      if (L.price != null) bad(p.list_price === L.price, `price ${p.list_price} != ${L.price}`);
      if (L.sqft != null) bad(p.sqft === L.sqft, `sqft ${p.sqft} != ${L.sqft}`);
      bad(!/\?\s*$/m.test(out.split("\n")[0]), "asked a question instead of saving");
      bad(out.includes(L.address), `reply does not name the saved address: ${out.slice(0, 80)}`);
      if (L.seller) { const cs = await store.list("contacts", a.id); bad(cs.some((c: any) => c.type === "seller" && c.name.includes(L.seller!.split(" ")[0])), `seller ${L.seller} not saved as a seller contact`); }
      else bad((await store.list("contacts", a.id)).length === 0, "invented a contact");
    });
  }
});

// ======================================================================= B. slang dates x spoken times (60)
const TIMES: [string, number, number][] = [
  ["2pm", 14, 0], ["2 PM", 14, 0], ["2:30pm", 14, 30], ["2:30 p.m.", 14, 30], ["230pm", 14, 30], ["1030am", 10, 30], ["noon", 12, 0], ["half past 2", 14, 30],
  ["quarter to 3", 14, 45], ["quarter after 4", 16, 15], ["at 3", 15, 0], ["@ 4", 16, 0], ["three o'clock", 15, 0], ["10am", 10, 0], ["10a", 10, 0],
  ["9:15 am", 9, 15], ["around 3ish", 15, 0], ["at two thirty", 14, 30], ["11:45am", 11, 45], ["4p", 16, 0], ["at 1", 13, 0], ["5 pm", 17, 0], ["12pm", 12, 0], ["at ten", 10, 0],
];
type DateForm = { txt: string; day: Date };
function dateForms(a: Agent, r: () => number): DateForm[] {
  const today = partsIn(a.now, a.tz);
  const k = 2 + Math.floor(r() * 24), target = dayPlus(a, k), tp = partsIn(target, a.tz);
  const dow = notToday(a, r), dow2 = notToday(a, r);
  return [
    { txt: "tomorrow", day: dayPlus(a, 1) }, { txt: "tmrw", day: dayPlus(a, 1) }, { txt: "tmw", day: dayPlus(a, 1) }, { txt: "tomorow", day: dayPlus(a, 1) },
    { txt: "day after tomorrow", day: dayPlus(a, 2) }, { txt: "in 3 days", day: dayPlus(a, 3) }, { txt: "in two weeks", day: dayPlus(a, 14) },
    { txt: DOW[dow].slice(0, 3), day: nextDow(a, dow) }, { txt: `this ${DOW[dow].slice(0, 3)}`, day: nextDow(a, dow) }, { txt: `on ${DOW[dow2]}`, day: nextDow(a, dow2) },
    { txt: `next ${DOW[dow].slice(0, 3)}`, day: nextWeekDow(a, dow) }, { txt: `next ${DOW[dow2]}`, day: nextWeekDow(a, dow2) },
    { txt: `the ${ord(tp.d)}`, day: target }, { txt: `${tp.m}/${tp.d}`, day: target }, { txt: `${MON[tp.m - 1].slice(0, 3)} ${tp.d}`, day: target },
    { txt: `${MON[tp.m - 1]} ${ord(tp.d)}`, day: target }, { txt: `${DOW[tp.dow].slice(0, 3)} the ${ord(tp.d)}`, day: target },
    ...(today.d >= 1 ? [{ txt: "today", day: a.now }] : []),
  ];
}
test("B. slang dates and spoken times book the exact slot", async () => {
  const r = rng(9002);
  const frames: ((w: string, ad: string) => string)[] = [
    (w, ad) => `Showing at ${ad} ${w}`, (w, ad) => `${w} showing at ${ad}`, (w, ad) => `book a showing for ${ad} ${w}`, (w, ad) => `pls put a showing on the cal, ${ad}, ${w}`,
    (w, ad) => `schedule a tour at ${ad} ${w}`, (w, ad) => `showing ${w} at ${ad}`,
  ];
  for (let i = 0; i < 60; i++) {
    const a = await fresh(r);
    const df = pick(r, dateForms(a, r));
    // "today" needs a time that is still ahead (clock is 7-9 AM): anything from 10am on
    const tf = pick(r, df.txt === "today" ? TIMES.filter((t) => t[1] >= 10) : TIMES);
    const ad = pick(r, ["12 Oak St", "88 Birch Rd", "4501 Elm Ct", "9 Park Pl"]);
    const when = pick(r, [`${df.txt} ${tf[0]}`, `${df.txt} ${tf[0].startsWith("at ") || tf[0].startsWith("@") || tf[0].startsWith("around") ? tf[0] : "at " + tf[0]}`]);
    const msg = pick(r, frames)(when, ad);
    await scenario(`B${i} "${msg}" now=${a.now.toISOString()} ${a.tz}`, a, async (bad) => {
      const out = await say(a, msg);
      const all = await evs(a, "showing");
      bad(all.length === 1, `expected 1 showing, got ${all.length}: ${out.slice(0, 100)}`);
      slotIs(bad, a, all[0], df.day, tf[1], tf[2]);
      if (all[0]) bad(all[0].location === ad.replace(/ St$/, " Street").replace(/ Rd$/, " Road").replace(/ Ct$/, " Court").replace(/ Pl$/, " Place"), `location ${all[0].location}`);
    });
  }
});

test("B2. evening and 'tonight' phrasing lands in the evening, not at dawn", async () => {
  const r = rng(9003);
  const cases: [string, number, number, string][] = [
    ["tonight at 7 call with Dana", 19, 0, "call"], ["tonight @ 8 call with the Hendersons", 20, 0, "call"], ["meeting this evening at 6", 18, 0, "meeting"],
    ["dinner meeting tonight at 7:30", 19, 30, "meeting"], ["call tonight 7pm", 19, 0, "call"], ["showing this afternoon at 3", 15, 0, "showing"],
    ["meeting today at 11", 11, 0, "meeting"], ["lunch today at noon with Priya", 12, 0, "lunch"],
  ];
  for (const [i, [msg, h, mi, kind]] of cases.entries()) {
    const a = await fresh(r);
    await scenario(`B2-${i} "${msg}"`, a, async (bad) => {
      const out = await say(a, msg);
      const all = await evs(a);
      bad(all.length === 1, `expected 1 event, got ${all.length}: ${out.slice(0, 100)}`);
      slotIs(bad, a, all[0], a.now, h, mi);
      if (all[0]) bad(all[0].kind === kind || (kind === "lunch" && all[0].kind === "lunch"), `kind ${all[0].kind} != ${kind}`);
    });
  }
});

// ======================================================================= C. messy addresses on showings (24)
const MESSY: [string, string][] = [
  ["742 evergreen terr", "742 Evergreen Terrace"], ["1200 n. oak dr", "1200 N Oak Drive"], ["55 sw main st", "55 SW Main Street"], ["12 Oak St #4B", "12 Oak Street #4B"],
  ["12 oak st apt 4b", "12 Oak Street #4B"], ["12 oak st unit 7", "12 Oak Street #7"], ["300 martin luther king blvd", "300 Martin Luther King Boulevard"],
  ["1600 pennsylvania ave nw", "1600 Pennsylvania Avenue NW"], ["17 St. Mary's Rd", "17 St. Mary's Road"], ["88a lakeview ln", "88A Lakeview Lane"], ["6 O'Brien Way", "6 O'Brien Way"],
  ["12 e. 5th st", "12 E 5th Street"], ["410 NE 5th St Apt 12", "410 NE 5th Street #12"], ["9100 OLD GEORGETOWN RD", "9100 Old Georgetown Road"], ["7 McKinley Pkwy", "7 McKinley Parkway"],
  ["2200 s. wabash ave #1501", "2200 S Wabash Avenue #1501"], ["14 w 3rd st", "14 W 3rd Street"], ["500 Fifth Avenue Suite 200", "500 Fifth Avenue #200"],
  ["31 Hawthorne Cir.", "31 Hawthorne Circle"], ["1 Broadway Plaza", "1 Broadway Plaza"], ["6502 se Foster Rd", "6502 SE Foster Road"], ["27 Rue Dr", "27 Rue Drive"],
  ["19 north Elm street", "19 North Elm Street"], ["8800 Mc Arthur Blvd", "8800 Mc Arthur Boulevard"],
];
test("C. messy addresses are cleaned up consistently on the calendar", async () => {
  const r = rng(9004);
  for (const [i, [typed, want]] of MESSY.entries()) {
    const a = await fresh(r);
    const dow = notToday(a, r), h = 9 + Math.floor(r() * 8);
    const ap = h >= 12 ? "pm" : "am", hh = h > 12 ? h - 12 : h;
    const msg = pick(r, [`Showing at ${typed} ${DOW[dow]} at ${hh}${ap}`, `showing ${DOW[dow]} ${hh}${ap} ${typed}`, `book a showing at ${typed} on ${DOW[dow]} at ${hh} ${ap.toUpperCase()}`]);
    await scenario(`C${i} "${msg}"`, a, async (bad) => {
      await say(a, msg);
      const all = await evs(a, "showing");
      bad(all.length === 1, `expected 1 showing, got ${all.length}`);
      if (!all[0]) return;
      bad(all[0].location === want, `location "${all[0].location}" != "${want}"`);
      slotIs(bad, a, all[0], nextDow(a, dow), h, 0);
    });
  }
});

// ======================================================================= D. bulk imports typed into chat (20)
const IMPORTS: { lines: string[]; names: string[] }[] = [
  { lines: ["Sean O'Malley, sean.omalley@gmail.com, 301-555-0101", "Mary-Kate Olsen, mk@olsen.com, (202) 555-0145", "Jean-Luc Picard, jl@starfleet.org, 4155550199"], names: ["Sean O'Malley", "Mary-Kate Olsen", "Jean-Luc Picard"] },
  { lines: ["D'Angelo Russell, dangelo@nba.com", "Anne-Marie Slaughter, am@slaughter.org", "Tom Alvarez, tom@alv.co"], names: ["D'Angelo Russell", "Anne-Marie Slaughter", "Tom Alvarez"] },
  { lines: ["Priya Shah, priya@shah.dev, interested in 3 bed under 600k", "Marcus Lee, marcus@lee.io, wants a condo", "Grace Kim, grace@kim.net, just browsing"], names: ["Priya Shah", "Marcus Lee", "Grace Kim"] },
  { lines: ["Maria Garcia-Lopez, mgl@mail.com, 240-555-0111", "Bob Smith-Jones, bsj@mail.com, 240-555-0112"], names: ["Maria Garcia-Lopez", "Bob Smith-Jones"] },
  { lines: ["Dana Whitfield\tdana@w.com\t301-555-0188", "Kevin O'Neil\tkevin@oneil.com\t301-555-0189"], names: ["Dana Whitfield", "Kevin O'Neil"] },
  { lines: ["Name,Email,Phone", "Liam O'Connor,liam@oc.com,555-123-4567", "Noah Brown-Smith,noah@bs.com,555-123-4568", "Olivia Chen,olivia@chen.com,555-123-4569"], names: ["Liam O'Connor", "Noah Brown-Smith", "Olivia Chen"] },
  { lines: ["Ava Johnson ava@aj.com 301-555-0001", "Ethan Wright ethan@ew.com 301-555-0002"], names: ["Ava Johnson", "Ethan Wright"] },
  { lines: ["Sofia Rossi, sofia@rossi.it", "Luca Bianchi, luca@bianchi.it", "Giulia De Luca, giulia@deluca.it", "Marco Polo, marco@polo.it", "Elena Conti, elena@conti.it"], names: ["Sofia Rossi", "Luca Bianchi", "Giulia De Luca", "Marco Polo", "Elena Conti"] },
];
test("D. pasted lists create one clean contact per person, with apostrophes and hyphens intact", async () => {
  const r = rng(9005);
  for (const [i, imp] of IMPORTS.entries()) for (const lead of [`Here's my sign-in sheet:`, `import these contacts:`]) {
    const a = await fresh(r);
    await scenario(`D${i} ${lead}`, a, async (bad) => {
      await say(a, `${lead}\n${imp.lines.join("\n")}`);
      const cs: any[] = await store.list("contacts", a.id);
      for (const n of imp.names) bad(cs.some((c) => c.name === n), `contact "${n}" missing (have: ${cs.map((c) => c.name).join(" | ")})`);
      bad(cs.length === imp.names.length, `${cs.length} contacts for ${imp.names.length} people`);
      const withEmail = imp.lines.filter((l) => /@/.test(l)).length;
      bad(cs.filter((c) => c.email).length === withEmail, "emails not all saved");
      // pasting the same list again never duplicates
      await say(a, `${lead}\n${imp.lines.join("\n")}`);
      bad((await store.list("contacts", a.id)).length === imp.names.length, "second paste created duplicates");
    });
  }
});

// ======================================================================= E. content requests (30)
async function withListing(a: Agent, addr = "12 Oak St, Rockville MD", facts = "3 bed 2 bath $450,000") {
  await a.say(`New listing at ${addr}. ${facts}`);
  return (await store.list("properties", a.id))[0];
}
test("E. content requests produce the right number of posts, for the right listing, with true facts only", async () => {
  const r = rng(9006);
  const counts: [string, number][] = [["3 posts", 3], ["three posts", 3], ["2 instagram posts", 2], ["a post", 1], ["5 captions", 5], ["4 posts", 4]];
  for (let i = 0; i < 12; i++) {
    const a = await fresh(r);
    const [txt, n] = pick(r, counts);
    const form = pick(r, [(t: string) => `make me ${t} for 12 Oak St`, (t: string) => `can you create ${t} for the Oak St listing`, (t: string) => `I need ${t} for this listing`, (t: string) => `write ${t} for 12 Oak Street pls`]);
    await scenario(`E${i} ${form(txt)}`, a, async (bad) => {
      const p = await withListing(a);
      const posts0 = (await store.list("social_posts", a.id)).length;
      const out = await say(a, form(txt));
      const posts: any[] = (await store.list("social_posts", a.id)).slice(posts0);
      bad(posts.length === n, `${posts.length} posts created, wanted ${n}: ${out.slice(0, 100)}`);
      bad(posts.every((x) => x.property_id === p.id), "post not attached to the listing");
      bad(new Set(posts.map((x) => x.caption)).size === posts.length, "posts are duplicates of each other");
      bad(posts.every((x) => !x.caption || !/\b(\d+) ?(bed|bd)/i.test(x.caption) || /3 bed/.test(x.caption)), "caption states a bed count that isn't on file");
      bad(posts.every((x) => !/\$\d/.test(x.caption) || /\$450,000/.test(x.caption)), "caption states a price that isn't on file");
      bad(posts.every((x) => x.status !== "published"), "post marked published without approval");
    });
  }
  // single-post variants
  const singles: [string, (p: any) => boolean, string][] = [
    ["create an instagram story for 12 Oak St", (x) => x.platform === "instagram_story", "story platform"],
    ["price improvement post for 12 Oak St", (x) => /price improvement/i.test(x.caption), "price improvement caption"],
    ["write a just listed caption for 12 Oak Street", (x) => /just listed/i.test(x.caption), "just listed caption"],
    ["make an instagram post for the Oak St listing", (x) => x.platform === "instagram", "instagram platform"],
  ];
  for (const [i, [msg, ok, why]] of singles.entries()) {
    const a = await fresh(r);
    await scenario(`E-single${i} ${msg}`, a, async (bad) => {
      await withListing(a);
      const posts0 = (await store.list("social_posts", a.id)).length;
      await say(a, msg);
      const posts: any[] = (await store.list("social_posts", a.id)).slice(posts0);
      bad(posts.length === 1, `${posts.length} posts`);
      bad(!!posts[0] && ok(posts[0]), why);
    });
  }
  // "this listing" right after saving it, no address typed
  for (let i = 0; i < 4; i++) {
    const a = await fresh(r);
    await scenario(`E-this${i}`, a, async (bad) => {
      const p = await withListing(a, pick(r, ["77 Maple Ave, Frederick MD", "9 Birch Ct, Denver CO"]));
      const out = await say(a, pick(r, ["make me 3 posts for this listing", "now 3 posts for it", "make 3 posts"]));
      const posts: any[] = await store.list("social_posts", a.id);
      bad(posts.length === 3 && posts.every((x) => x.property_id === p.id), `${posts.length} posts: ${out.slice(0, 100)}`);
    });
  }
  // no listing on file: ask which one, create nothing
  for (const msg of ["make me 3 posts for this listing", "make a post", "write me an instagram caption"]) {
    const a = await fresh(r);
    await scenario(`E-none ${msg}`, a, async (bad) => {
      const out = await say(a, msg);
      bad(qCount(out) === 1 && /address|which|property|listing/i.test(out), `should ask one clear question: ${out.slice(0, 120)}`);
      bad((await store.list("social_posts", a.id)).length === 0, "created a post for nothing");
    });
  }
});

// ======================================================================= F. emails (14)
test("F. email drafts are addressed to the right person, never sent, and ask when unsure", async () => {
  const r = rng(9007);
  const names = ["Dana Whitfield", "Priya Shah", "Kevin O'Neil", "Mary-Kate Olsen", "Tom Alvarez"];
  const forms: ((n: string) => string)[] = [
    (n) => `draft an email to ${n.split(" ")[0]} about the open house`, (n) => `email ${n} about the inspection report`, (n) => `write ${n.split(" ")[0]} a quick follow up email about the offer`,
    (n) => `send ${n.split(" ")[0]} an email about financing options`,
  ];
  for (let i = 0; i < 10; i++) {
    const a = await fresh(r);
    const n = names[i % names.length], first = n.split(" ")[0];
    await scenario(`F${i}`, a, async (bad) => {
      await a.say(`I have a new buyer named ${n}, ${first.toLowerCase().replace(/[^a-z]/g, "")}@mail.com, looking for a 3 bedroom around $500k`);
      const c = (await store.list("contacts", a.id)).find((x: any) => x.name === n);
      bad(!!c, "contact not created");
      const msg = forms[i % forms.length](n);
      const out = await say(a, msg);
      const drafts: any[] = await store.list("email_drafts", a.id);
      bad(drafts.length === 1, `${drafts.length} drafts for "${msg}": ${out.slice(0, 100)}`);
      bad(!!drafts[0] && drafts[0].status !== "sent", "marked sent");
      bad(!!drafts[0] && c && JSON.stringify(drafts[0]).includes(c.id), "draft not addressed to the contact");
      bad(!!drafts[0] && (drafts[0].body.includes(first) || drafts[0].body.includes("{{first_name}}")), "draft doesn't greet the person");
    });
  }
  // unknown recipient -> one question, nothing drafted
  for (const msg of ["email Dana", "draft an email about the open house", "email him about the offer", "text Priya"]) {
    const a = await fresh(r);
    await scenario(`F-ask ${msg}`, a, async (bad) => {
      const out = await say(a, msg);
      bad(qCount(out) === 1 && !/not sure how/i.test(out), `should ask who: ${out.slice(0, 100)}`);
      bad((await store.list("email_drafts", a.id)).length === 0, "drafted for nobody");
    });
  }
});

// ======================================================================= G. reschedules (36)
test("G. moving a booked showing lands on the exact new slot, never leaves a duplicate", async () => {
  const r = rng(9008);
  type M = { msg: (a: Agent, d1: number, newDow: number) => string; day: (a: Agent, d1: number, nd: number) => Date | null; h: number | null; mi?: number; relMin?: number };
  const moves: M[] = [
    { msg: () => "Move the showing to 4pm", day: () => null, h: 16 },
    { msg: () => "push it to 4", day: () => null, h: 16 },
    { msg: () => "Actually make that 11am", day: () => null, h: 11 },
    { msg: () => "change it to 5:30pm", day: () => null, h: 17, mi: 30 },
    { msg: () => "move my 9am showing to 4pm", day: () => null, h: 16 },
    { msg: () => "reschedule the 12 Oak St showing to noon", day: () => null, h: 12 },
    { msg: () => "bump the showing to 3", day: () => null, h: 15 },
    { msg: (a, d, n) => `Move the showing to ${DOW[n]}`, day: (a, d, n) => nextDow(a, n), h: 9 },
    { msg: (a, d, n) => `reschedule it for ${DOW[n].slice(0, 3)} at 2pm`, day: (a, d, n) => nextDow(a, n), h: 14 },
    { msg: () => "move that to tomorrow at 1", day: (a) => dayPlus(a, 1), h: 13 },
    { msg: () => "push the showing to tmrw 10:30am", day: (a) => dayPlus(a, 1), h: 10, mi: 30 },
    { msg: (a, d, n) => `can we move the showing to next ${DOW[n].slice(0, 3)} at 11?`, day: (a, d, n) => nextWeekDow(a, n), h: 11 },
    { msg: () => "push the showing back an hour", day: () => null, h: 10 },
    { msg: () => "move the showing up 30 min", day: () => null, h: 8, mi: 30 },
    { msg: () => "push it back 45 minutes", day: () => null, h: 9, mi: 45 },
    { msg: () => "move it an hour earlier", day: () => null, h: 8 },
  ];
  for (let i = 0; i < 36; i++) {
    const a = await fresh(r);
    const m = moves[i % moves.length];
    const d1 = notToday(a, r);
    const nd = pick(r, [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== d1 && x !== partsIn(a.now, a.tz).dow));
    const msg = m.msg(a, d1, nd);
    await scenario(`G${i} "${msg}"`, a, async (bad) => {
      await say(a, `Showing at 12 Oak St ${DOW[d1]} at 9am`);
      const out = await say(a, msg);
      const all = await evs(a, "showing");
      bad(all.length === 1, `expected 1 showing, got ${all.length}: ${out.slice(0, 100)}`);
      const day = m.day(a, d1, nd) ?? nextDow(a, d1);
      slotIs(bad, a, all[0], day, m.h!, m.mi ?? 0);
      if (all[0]) bad(new Date(all[0].end_at).getTime() - new Date(all[0].start_at).getTime() === 45 * 60_000, "duration changed");
    });
  }
});

test("G2. undo puts a moved event back exactly where it was", async () => {
  const r = rng(9009);
  for (let i = 0; i < 8; i++) {
    const a = await fresh(r);
    const d1 = notToday(a, r);
    await scenario(`G2-${i}`, a, async (bad) => {
      await say(a, `Showing at 12 Oak St ${DOW[d1]} at 10am`);
      const before = (await evs(a, "showing"))[0];
      const res = await a.say(pick(r, ["Move the showing to 4pm", "push it to tomorrow at 2", "move the showing to 5pm"]));
      const moved = (await evs(a, "showing"))[0];
      bad(moved.start_at !== before.start_at, "did not move");
      const undo = res.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => /^undo/i.test(b.label));
      bad(!!undo, "no Undo offered");
      if (!undo) return;
      await a.act(undo.action);
      const back = await evs(a, "showing");
      bad(back.length === 1 && back[0].start_at === before.start_at && back[0].end_at === before.end_at, `not restored: ${back[0]?.start_at} vs ${before.start_at}`);
    });
  }
});

test("G3. a correction right after booking changes THAT event (time, day or both)", async () => {
  const r = rng(9010);
  const fixes: [string, (a: Agent, d1: number) => [Date, number, number]][] = [
    ["Actually make that 4", (a, d) => [nextDow(a, d), 16, 0]], ["no, 3pm", (a, d) => [nextDow(a, d), 15, 0]], ["sorry 11am", (a, d) => [nextDow(a, d), 11, 0]],
    ["oops I meant tomorrow", (a) => [dayPlus(a, 1), 10, 0]], ["wait, make it tomorrow at 2", (a) => [dayPlus(a, 1), 14, 0]], ["actually 1:30", (a, d) => [nextDow(a, d), 13, 30]],
  ];
  for (let i = 0; i < 12; i++) {
    const a = await fresh(r);
    const [msg, fn] = fixes[i % fixes.length];
    const d1 = pick(r, [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== partsIn(a.now, a.tz).dow && x !== partsIn(dayPlus(a, 1), a.tz).dow));
    await scenario(`G3-${i} "${msg}"`, a, async (bad) => {
      await say(a, `Schedule a call with Dana ${DOW[d1]} at 10am`);
      await say(a, msg);
      const all = await evs(a);
      bad(all.length === 1, `expected 1 event, got ${all.length}`);
      const [day, h, mi] = fn(a, d1);
      slotIs(bad, a, all[0], day, h, mi);
    });
  }
});

// ======================================================================= H. cancellations must ask (26)
test("H. cancelling always asks first; nothing disappears until the agent confirms", async () => {
  const r = rng(9011);
  const forms = ["Cancel the showing at 12 Oak St", "cancel my showing", "scrap the showing", "nix the showing at 12 Oak", "please remove the showing from my calendar", "drop the 12 Oak St showing",
    "call off the showing", "kill the showing", "delete the showing", "take the showing off my calendar", "cancel that", "cancel it"];
  for (let i = 0; i < 24; i++) {
    const a = await fresh(r);
    const msg = forms[i % forms.length];
    const d1 = notToday(a, r);
    await scenario(`H${i} "${msg}"`, a, async (bad) => {
      await say(a, `Showing at 12 Oak St ${DOW[d1]} at 2pm`);
      const res = await a.say(msg);
      const txt = res.milaMessage.content + JSON.stringify(res.milaMessage.blocks);
      bad((await evs(a, "showing")).length === 1, "event vanished without confirmation");
      bad(/confirm|OK|yes|approve/i.test(txt), `didn't ask for confirmation: ${res.milaMessage.content.slice(0, 100)}`);
      const btn = res.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => b.approvalId);
      bad(!!btn, "no approve button");
      if (!btn) return;
      if (i % 3 === 0) { // changed mind
        await a.act({ type: "reject", id: btn.approvalId });
        bad((await evs(a, "showing")).length === 1, "rejecting still cancelled it");
      } else {
        await a.act({ type: "approve", id: btn.approvalId });
        bad((await evs(a, "showing")).length === 0, "approving did not cancel it");
      }
    });
  }
  for (const msg of ["cancel everything", "cancel all my appointments"]) {
    const a = await fresh(r);
    await scenario(`H-all "${msg}"`, a, async (bad) => {
      await say(a, `Showing at 12 Oak St ${DOW[notToday(a, r)]} at 2pm`);
      await say(a, `Meeting with Dana ${DOW[notToday(a, r)]} at 11am`);
      const n0 = (await evs(a)).length;
      const out = await say(a, msg);
      bad((await evs(a)).length === n0, "bulk cancel ran without approval");
      bad(/OK|confirm/i.test(out), `no confirmation request: ${out.slice(0, 100)}`);
    });
  }
});

// ======================================================================= I. ambiguity: ask ONE clear question, then finish (24)
test("I. vague requests get exactly one clear question and the answer completes the original request", async () => {
  const r = rng(9012);
  const rows: { msg: string; answer: string; check: (a: Agent, bad: (c: boolean, w: string) => void) => Promise<void> }[] = [
    { msg: "schedule a showing", answer: "friday 2pm", check: async (a, bad) => { const e = (await evs(a, "showing"))[0]; slotIs(bad, a, e, nextDow(a, 5), 14, 0); } },
    { msg: "book something Friday", answer: "a showing at 3pm", check: async (a, bad) => { const e = (await evs(a))[0]; slotIs(bad, a, e, nextDow(a, 5), 15, 0); bad(e?.kind === "showing", `kind ${e?.kind}`); } },
    { msg: "set up a call", answer: "tomorrow at 10", check: async (a, bad) => { const e = (await evs(a, "call"))[0]; slotIs(bad, a, e, dayPlus(a, 1), 10, 0); } },
    { msg: "put a meeting on Thursday", answer: "11", check: async (a, bad) => { const e = (await evs(a, "meeting"))[0]; slotIs(bad, a, e, nextDow(a, 4), 11, 0); } },
    { msg: "remind me to call Dana", answer: "tomorrow at 9am", check: async (a, bad) => { const rm = (await store.list("reminders", a.id))[0]; bad(!!rm && ymd(rm.remind_at, a.tz) === ymd(dayPlus(a, 1), a.tz) && hm(rm.remind_at, a.tz) === "9:00", `reminder ${rm?.remind_at}`); } },
    { msg: "remind me", answer: "friday to send the CMA", check: async (a, bad) => { const rm = (await store.list("reminders", a.id))[0]; bad(!!rm && /cma/i.test(rm.title) && ymd(rm.remind_at, a.tz) === ymd(nextDow(a, 5), a.tz), `reminder ${JSON.stringify(rm)}`); } },
    { msg: "I have a new buyer", answer: "Priya Shah", check: async (a, bad) => { bad((await store.list("contacts", a.id)).some((c: any) => c.name === "Priya Shah" && c.type === "buyer"), "buyer not created"); } },
    { msg: "add a new listing", answer: "55 Cedar Ln, Frederick MD 3 bed 2 bath $400k", check: async (a, bad) => { const p = (await store.list("properties", a.id))[0]; bad(!!p && p.address === "55 Cedar Lane" && p.list_price === 400000, `property ${JSON.stringify(p)}`); } },
    { msg: "I'm out of town", answer: "next Monday", check: async (a, bad) => { const e = (await evs(a)).find((x: any) => x.title === "Out of office"); slotIs(bad, a, e, nextWeekDow(a, 1), 8, 0); } },
    { msg: "open house Sunday", answer: "123 Main St Rockville MD 1-3", check: async (a, bad) => { const e = (await evs(a, "open_house"))[0]; slotIs(bad, a, e, nextDow(a, 0), 13, 0); } },
  ];
  for (const [i, row] of rows.entries()) for (let k = 0; k < 2; k++) {
    const a = await fresh(r);
    await scenario(`I${i}.${k} "${row.msg}"`, a, async (bad) => {
      const ev0 = (await evs(a)).length, props0 = (await store.list("properties", a.id)).length;
      const q = await say(a, row.msg);
      bad(qCount(q) === 1, `expected exactly one question, got: ${q.slice(0, 160)}`);
      bad(!/not sure how to do that/i.test(q), "gave up instead of asking");
      bad((await evs(a)).length === ev0 && (await store.list("properties", a.id)).length === props0, "changed data before it had the details");
      await say(a, row.answer);
      await row.check(a, bad);
    });
  }
  // nothing to act on: say so plainly and change nothing
  for (const msg of ["move it", "cancel it", "reschedule my showing", "push the meeting"]) {
    const a = await fresh(r);
    await scenario(`I-empty "${msg}"`, a, async (bad) => {
      const out = await say(a, msg);
      bad(/don't see|nothing|which|when|what/i.test(out) && !/not sure how to do that/i.test(out), `unhelpful: ${out.slice(0, 100)}`);
      bad((await evs(a)).length === 0, "created an event from a move/cancel request");
    });
  }
});

test("I2. several events match: Mila asks which one instead of guessing", async () => {
  const r = rng(9013);
  for (let i = 0; i < 6; i++) {
    const a = await fresh(r);
    await scenario(`I2-${i}`, a, async (bad) => {
      const d1 = notToday(a, r);
      await say(a, `Showing at 12 Oak St ${DOW[d1]} at 9am`);
      await say(a, `Showing at 88 Birch Rd ${DOW[d1]} at 1pm`);
      await say(a, `Meeting with Dana ${DOW[d1]} at 4pm`); // last event is now the meeting
      const before = (await evs(a)).map((e: any) => e.start_at).join();
      const res = await a.say(pick(r, ["move the showing to 3pm", "reschedule the showing to 5", "cancel the showing"]));
      const txt = res.milaMessage.content + JSON.stringify(res.milaMessage.blocks);
      const stillSame = (await evs(a)).map((e: any) => e.start_at).join() === before;
      bad(stillSame, "changed an event although two showings matched");
      bad(/which/i.test(txt), `didn't ask which one: ${res.milaMessage.content.slice(0, 100)}`);
      bad(/12 Oak/.test(txt) && /88 Birch/.test(txt), "options don't name both showings");
    });
  }
});

// ======================================================================= J. double booking (20)
test("J. overlapping bookings are caught, resolvable, and never silently double-booked", async () => {
  const r = rng(9014);
  for (let i = 0; i < 20; i++) {
    const a = await fresh(r);
    const d = notToday(a, r);
    const kind2 = pick(r, ["showing", "call", "meeting"]);
    const mode = i % 4;
    await scenario(`J${i} ${mode}`, a, async (bad) => {
      await say(a, `Showing at 12 Oak St ${DOW[d]} at 2pm`);
      if (mode === 0) { // overlaps by 15 minutes
        const out = await say(a, `${kind2 === "showing" ? "Showing at 88 Birch Rd" : kind2 === "call" ? "Call with Dana" : "Meeting with Dana"} ${DOW[d]} at 2:30pm`);
        bad(/already have/i.test(out), `no conflict warning: ${out.slice(0, 100)}`);
        bad((await evs(a)).length === 1, "double-booked");
      } else if (mode === 1) { // exact same slot, find another time
        const res = await a.say(`call with Priya ${DOW[d]} 2pm`);
        bad((await evs(a)).length === 1, "double-booked");
        const find = res.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => b.action?.choice === "find");
        bad(!!find, "no 'find another time' offered");
        if (!find) return;
        const slots = await a.act(find.action);
        const pickBtn = slots.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => b.action?.type === "pick_slot");
        bad(!!pickBtn, "no slots offered");
        if (!pickBtn) return;
        await a.act(pickBtn.action);
        const all = await evs(a);
        bad(all.length === 2, `expected 2 events, got ${all.length}`);
        bad(all.length === 2 && new Date(all[1].start_at) >= new Date(all[0].end_at), "new event overlaps the old one");
        bad(all.length === 2 && all[1].kind === "call", `kind ${all[1]?.kind}`);
      } else if (mode === 2) { // back to back is fine: showing 2:00-2:45 then 2:45
        await say(a, `Meeting with Dana ${DOW[d]} at 2:45pm`);
        bad((await evs(a)).length === 2, "back-to-back event was refused");
      } else { // keep the existing one
        const res = await a.say(`showing at 5 Elm Ct ${DOW[d]} at 2:15pm`);
        const keep = res.milaMessage.blocks.flatMap((b: any) => b.buttons ?? []).find((b: any) => b.action?.choice === "keep");
        bad(!!keep, "no keep option");
        if (keep) await a.act(keep.action);
        const all = await evs(a);
        bad(all.length === 1 && all[0].location === "12 Oak Street", "kept the wrong event");
      }
    });
  }
});

test("J2. two bookings in one message that collide never both land", async () => {
  const r = rng(9015);
  for (let i = 0; i < 4; i++) {
    const a = await fresh(r);
    const d = notToday(a, r);
    await scenario(`J2-${i}`, a, async (bad) => {
      await say(a, `Book a showing ${DOW[d]} at 3 PM and another ${DOW[d]} at 3:15 PM`);
      const all = await evs(a);
      bad(all.length === 1, `${all.length} events; the collision must be questioned, not double-booked`);
      for (let x = 0; x < all.length; x++) for (let y = x + 1; y < all.length; y++) bad(!(new Date(all[x].start_at) < new Date(all[y].end_at) && new Date(all[y].start_at) < new Date(all[x].end_at)), "overlap");
    });
  }
});

// ======================================================================= K. reminders (24)
test("K. reminders fire at the time said, with the right text", async () => {
  const r = rng(9016);
  type R = { msg: (a: Agent, d: number) => string; at: (a: Agent, d: number) => [Date, number, number]; title: RegExp };
  const rows: R[] = [
    { msg: () => "Remind me to call Dana tomorrow at 9am", at: (a) => [dayPlus(a, 1), 9, 0], title: /call Dana/i },
    { msg: () => "remind me tmrw 9am to call Dana", at: (a) => [dayPlus(a, 1), 9, 0], title: /call Dana/i },
    { msg: () => "remind me to send the CMA to Priya tmrw at 2:30pm", at: (a) => [dayPlus(a, 1), 14, 30], title: /CMA/ },
    { msg: (a, d) => `remind me ${DOW[d]} to send the CMA`, at: (a, d) => [nextDow(a, d), 9, 0], title: /CMA/ },
    { msg: (a, d) => `remind me on ${DOW[d].slice(0, 3)} at 4pm to confirm the inspection`, at: (a, d) => [nextDow(a, d), 16, 0], title: /inspection/i },
    { msg: () => "remind me at 5 to pick up the signs", at: (a) => [a.now, 17, 0], title: /signs/ },
    { msg: () => "remind me at noon to call the lender", at: (a) => [a.now, 12, 0], title: /lender/ },
    { msg: () => "set a reminder for tomorrow at 8am to review the contract", at: (a) => [dayPlus(a, 1), 8, 0], title: /contract/ },
    { msg: (a, d) => `remind me to bring flyers ${DOW[d]} at 10`, at: (a, d) => [nextDow(a, d), 10, 0], title: /flyers/ },
    { msg: () => "remind me the day after tomorrow at 1pm to email Kevin O'Neil", at: (a) => [dayPlus(a, 2), 13, 0], title: /Kevin O'Neil/ },
    { msg: () => "remind me in 3 days to check on the Hendersons", at: (a) => [dayPlus(a, 3), 9, 0], title: /Hendersons/ },
    { msg: () => "remind me next Mon at 8 to post the open house", at: (a) => [nextWeekDow(a, 1), 8, 0], title: /open house/ },
  ];
  for (let i = 0; i < 24; i++) {
    const a = await fresh(r);
    const row = rows[i % rows.length];
    const d = pick(r, [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== partsIn(a.now, a.tz).dow && x !== partsIn(dayPlus(a, 1), a.tz).dow));
    const msg = row.msg(a, d);
    await scenario(`K${i} "${msg}"`, a, async (bad) => {
      const out = await say(a, msg);
      const rems: any[] = await store.list("reminders", a.id);
      bad(rems.length === 1, `${rems.length} reminders: ${out.slice(0, 100)}`);
      if (!rems[0]) return;
      const [day, h, mi] = row.at(a, d);
      bad(ymd(rems[0].remind_at, a.tz) === ymd(day, a.tz), `date ${ymd(rems[0].remind_at, a.tz)} != ${ymd(day, a.tz)}`);
      bad(hm(rems[0].remind_at, a.tz) === `${h}:${String(mi).padStart(2, "0")}`, `time ${hm(rems[0].remind_at, a.tz)} != ${h}:${String(mi).padStart(2, "0")}`);
      bad(row.title.test(rems[0].title), `title "${rems[0].title}"`);
      bad(new Date(rems[0].remind_at) > a.now, "reminder in the past");
    });
  }
});

test("K2. relative-hour reminders and reminders about an event", async () => {
  const r = rng(9017);
  const rel: [string, number][] = [["remind me in 2 hours to call Bob", 120], ["remind me in 30 minutes to move the car", 30], ["remind me in an hour to call the lender", 60], ["remind me in 45 min to text Dana", 45]];
  for (const [i, [msg, mins]] of rel.entries()) {
    const a = await fresh(r);
    await scenario(`K2-${i} "${msg}"`, a, async (bad) => {
      await say(a, msg);
      const rem = (await store.list("reminders", a.id))[0];
      bad(!!rem && Math.abs(new Date(rem.remind_at).getTime() - (a.now.getTime() + mins * 60_000)) <= 60_000, `reminder at ${rem?.remind_at}, now ${a.now.toISOString()}`);
    });
  }
  for (let i = 0; i < 4; i++) {
    const a = await fresh(r);
    const d = notToday(a, r);
    await scenario(`K2-event${i}`, a, async (bad) => {
      await say(a, `Showing at 12 Oak St ${DOW[d]} at 2pm`);
      await say(a, pick(r, ["remind me 1 hour before the showing", "remind me an hour before the showing", "remind me 1 hour before"]));
      const rem = (await store.list("reminders", a.id))[0];
      const ev = (await evs(a, "showing"))[0];
      bad(!!rem && !!ev && new Date(rem.remind_at).getTime() === new Date(ev.start_at).getTime() - 3_600_000, `reminder ${rem?.remind_at} vs event ${ev?.start_at}`);
    });
  }
});

// ======================================================================= L. memory, names, recall (30)
test("L. names with apostrophes and hyphens are saved whole, and recalled", async () => {
  const r = rng(9018);
  const names = ["Mary-Kate O'Neil", "D'Angelo Russell", "Jean-Luc Picard", "Kevin O'Brien", "Anne-Marie Dubois", "Sean O'Malley", "Ana Maria Lopez", "Li Wei", "Mc Donald Reyes", "Kimberly Smith-Jones"];
  const facts: [string, RegExp][] = [["wants a big backyard and a garage", /backyard/i], ["has two kids and a dog", /kids|dog/i], ["is worried about interest rates", /rates/i], ["is pre-approved for $650k", /650/], ["needs to move by the end of June", /june/i]];
  for (let i = 0; i < 20; i++) {
    const a = await fresh(r);
    const n = names[i % names.length], first = n.split(" ")[0];
    const [fact, re] = facts[i % facts.length];
    await scenario(`L${i} ${n}`, a, async (bad) => {
      await say(a, pick(r, [`I have a new buyer named ${n} looking for a 3 bedroom around $600k`, `new buyer named ${n}, wants 3 bed, budget 600k`]));
      const cs: any[] = await store.list("contacts", a.id);
      bad(cs.length === 1 && cs[0].name === n, `contact names: ${cs.map((c) => c.name).join(" | ")}`);
      bad(cs[0]?.budget_max === 600000, `budget ${cs[0]?.budget_max}`);
      await say(a, `${first} ${fact}`);
      const mem = (await store.list("memories", a.id)).filter((m: any) => m.subject_id === cs[0]?.id);
      bad(mem.some((m: any) => re.test(m.value)), `fact not stored: ${mem.map((m: any) => m.value).join(" | ")}`);
      const out = await say(a, pick(r, [`what do you know about ${first}`, `tell me about ${n}`, `who is ${first}?`]));
      bad(out.includes(n), `recall doesn't name them: ${out.slice(0, 120)}`);
      bad(re.test(out), `recall misses the saved fact: ${out.slice(0, 200)}`);
      bad((await store.list("contacts", a.id)).length === 1, "recall/learning duplicated the contact");
    });
  }
  const mem: [string, RegExp, string][] = [
    ["remember that I never show on Sundays", /sundays/i, "what do you remember about me"],
    ["keep in mind I always sign my emails with Sarah C.", /sarah c/i, "what do you know about me"],
    ["note that my farm area is Kensington and Wheaton", /kensington/i, "what do you remember about me"],
    ["remember I prefer texting over calling", /texting/i, "what do you know about me"],
    ["i usually do open houses on saturdays from 1-3", /saturdays/i, "what do you remember about me"],
    ["I specialize in first time buyers", /first time buyers/i, "what do you know about me"],
    ["my goal is to close 24 deals this year", /24 deals/i, "what do you remember about me"],
    ["remember that I don't work on Fridays", /fridays/i, "what do you remember about me"],
    ["keep in mind I prefer short emails", /short emails/i, "what do you remember about me"],
    ["remember: lockbox code at the Oak St house is 4412", /4412/, "what do you remember about me"],
  ];
  for (const [i, [msg, re, ask]] of mem.entries()) {
    const a = await fresh(r);
    await scenario(`L-mem${i} "${msg}"`, a, async (bad) => {
      await say(a, msg);
      const out = await say(a, ask);
      bad(re.test(out), `recall lost it: ${out.slice(0, 200)}`);
    });
  }
});

test("L2. facts about clients go on the right client; unknown names are never invented", async () => {
  const r = rng(9019);
  for (let i = 0; i < 6; i++) {
    const a = await fresh(r);
    await scenario(`L2-${i}`, a, async (bad) => {
      await say(a, "I have a new buyer named Dana Whitfield looking for a 3 bedroom around $600k");
      await say(a, "I have a new seller named Kevin O'Neil, selling his 4 bedroom in Rockville");
      await say(a, "Dana wants a finished basement");
      await say(a, "Kevin has two dogs and a cat");
      const cs: any[] = await store.list("contacts", a.id);
      const dana = cs.find((c) => c.name === "Dana Whitfield"), kev = cs.find((c) => c.name === "Kevin O'Neil");
      const mem: any[] = await store.list("memories", a.id);
      bad(mem.some((m) => m.subject_id === dana.id && /basement/i.test(m.value)), "Dana's basement fact missing");
      bad(!mem.some((m) => m.subject_id === kev.id && /basement/i.test(m.value)), "Dana's fact leaked onto Kevin");
      bad(mem.some((m) => m.subject_id === kev.id && /dogs/i.test(m.value)), "Kevin's pets fact missing");
      const out = await say(a, "what do you know about Zelda Fitzgerald");
      bad(/don't have|no one|not in/i.test(out) && !/basement|dogs/i.test(out), `invented or leaked: ${out.slice(0, 120)}`);
      bad((await store.list("contacts", a.id)).length === 2, "a lookup created a contact");
    });
  }
});

// ======================================================================= M. time off (22)
test("M. time off blocks exactly the days said and warns about what's already booked", async () => {
  const r = rng(9020);
  for (let i = 0; i < 22; i++) {
    const a = await fresh(r);
    const k = 2 + Math.floor(r() * 12), span = pick(r, [0, 1, 2, 4]);
    const s = dayPlus(a, k), e = dayPlus(a, k + span), sp = partsIn(s, a.tz), ep = partsIn(e, a.tz);
    const md = (p: ReturnType<typeof partsIn>) => `${p.m}/${p.d}`;
    const single = [`I'm out of town ${DOW[sp.dow]}`, `taking ${DOW[sp.dow]} off`, `out of the office on the ${ord(sp.d)}`, `I'm on vacation ${md(sp)}`, `unavailable ${MON[sp.m - 1].slice(0, 3)} ${sp.d}`];
    const range = [`I'll be on vacation ${md(sp)} through ${md(ep)}`, `out of town ${MON[sp.m - 1]} ${sp.d} thru ${MON[ep.m - 1]} ${ep.d}`, `off ${md(sp)} to ${md(ep)}`, `out of town ${md(sp)}-${md(ep)}`];
    const msg = span === 0 ? pick(r, single) : pick(r, range);
    const clash = i % 3 === 0;
    await scenario(`M${i} "${msg}"`, a, async (bad) => {
      if (clash) await say(a, `Showing at 12 Oak St ${md(sp)} at 2pm`);
      const out = await say(a, msg);
      const off = (await evs(a)).filter((x: any) => x.title === "Out of office");
      bad(off.length === 1, `${off.length} out-of-office blocks: ${out.slice(0, 100)}`);
      if (off[0]) {
        bad(ymd(off[0].start_at, a.tz) === ymd(s, a.tz), `starts ${ymd(off[0].start_at, a.tz)} != ${ymd(s, a.tz)}`);
        bad(ymd(off[0].end_at, a.tz) === ymd(e, a.tz), `ends ${ymd(off[0].end_at, a.tz)} != ${ymd(e, a.tz)}`);
      }
      if (clash) bad(/heads up|already have/i.test(out), `didn't warn about the showing: ${out.slice(0, 120)}`);
      else bad(/nothing else/i.test(out), `claims a clash that isn't there: ${out.slice(0, 120)}`);
    });
  }
  // booking into time off is questioned
  for (let i = 0; i < 4; i++) {
    const a = await fresh(r);
    const d = notToday(a, r);
    await scenario(`M-after${i}`, a, async (bad) => {
      await say(a, `I'm out of town ${DOW[d]}`);
      const out = await say(a, `showing at 12 Oak St ${DOW[d]} at 2pm`);
      bad(/already have|out of office/i.test(out), `booked into time off without a word: ${out.slice(0, 100)}`);
      bad((await evs(a, "showing")).length === 0, "showing was booked on a day off");
    });
  }
});

// ======================================================================= N. showing sheets & property links (12)
test("N. bookings tie to saved listings, and the showing sheet is one tap away", async () => {
  const r = rng(9021);
  for (let i = 0; i < 6; i++) {
    const a = await fresh(r);
    const d = notToday(a, r);
    await scenario(`N${i}`, a, async (bad) => {
      const p = await withListing(a, pick(r, ["12 Oak St, Rockville MD", "12 Oak Street, Rockville MD"]));
      const res = await a.say(pick(r, [`showing at 12 Oak St ${DOW[d]} at 11am`, `Showing at 12 oak street ${DOW[d]} 11am`, `book a showing ${DOW[d]} at 11 at 12 Oak St`]));
      const ev = (await evs(a, "showing"))[0];
      bad(!!ev && ev.property_id === p.id, `showing not linked to the saved listing (${ev?.property_id} vs ${p.id})`);
      const links = JSON.stringify(res.milaMessage.blocks);
      bad(links.includes(`/properties/${p.id}`), "no showing-sheet link in the reply");
    });
  }
  for (const msg of ["start a showing sheet for 12 Oak St", "I need a showing sheet for 12 Oak St", "pull up the showing sheet for the Oak St listing", "showing sheet for 12 oak street"]) {
    const a = await fresh(r);
    await scenario(`N-sheet "${msg}"`, a, async (bad) => {
      const p = await withListing(a);
      const res = await sayFull(a, msg);
      bad(res.all.includes(`/properties/${p.id}`), `no link to the property's showing sheet: ${res.text.slice(0, 100)}`);
      bad(!/not sure how/i.test(res.text), "gave up");
    });
  }
  for (const msg of ["start a showing sheet", "showing sheet for 999 Nowhere Ln"]) {
    const a = await fresh(r);
    await scenario(`N-none "${msg}"`, a, async (bad) => {
      const out = await say(a, msg);
      bad(qCount(out) >= 1 || /don't have|no listing/i.test(out), `unclear: ${out.slice(0, 100)}`);
      bad(!/not sure how/i.test(out), "gave up");
    });
  }
});

// ======================================================================= O. open houses in slang (20)
test("O. open houses understand slang days and time ranges", async () => {
  const r = rng(9022);
  const ranges: [string, number, number][] = [["1-3", 13, 15], ["noon to 2", 12, 14], ["11-1", 11, 13], ["2 to 4", 14, 16], ["10am-12pm", 10, 12], ["1-4 PM", 13, 16], ["from 12 to 3", 12, 15]];
  for (let i = 0; i < 20; i++) {
    const a = await fresh(r);
    const [txt, h1, h2] = ranges[i % ranges.length];
    const form = i % 4;
    const dow = notToday(a, r);
    const day = form === 0 ? { t: "this Sat", d: nextDow(a, 6) } : form === 1 ? { t: "next Sun", d: nextWeekDow(a, 0) } : form === 2 ? { t: "tmrw", d: dayPlus(a, 1) } : { t: DOW[dow].slice(0, 3), d: nextDow(a, dow) };
    const msg = `open house at ${pick(r, ["412 Hillcrest Way", "88 Birch Rd", "1200 N Oak Dr"])}, Rockville MD ${day.t} ${txt}`;
    await scenario(`O${i} "${msg}"`, a, async (bad) => {
      const out = await say(a, msg);
      const e = (await evs(a, "open_house"))[0];
      bad(!!e, `no open house: ${out.slice(0, 100)}`);
      if (!e) return;
      slotIs(bad, a, e, day.d, h1, 0);
      bad(hm(e.end_at, a.tz) === `${h2}:00`, `ends ${hm(e.end_at, a.tz)} not ${h2}:00`);
    });
  }
});

// ======================================================================= P. multi-info / run-on messages (14)
test("P. one run-on message with several jobs does all of them", async () => {
  const r = rng(9023);
  for (let i = 0; i < 14; i++) {
    const a = await fresh(r);
    const d = notToday(a, r), d2 = pick(r, [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== d && x !== partsIn(a.now, a.tz).dow));
    const forms: [string, (bad: (c: boolean, w: string) => void) => Promise<void>][] = [
      [`showing at 12 Oak St ${DOW[d]} at 10am; remind me to call Dana ${DOW[d2]} at 9am`, async (bad) => { bad((await evs(a, "showing")).length === 1, "showing missing"); bad((await store.list("reminders", a.id)).length === 1, "reminder missing"); }],
      [`new buyer named Priya Shah looking for 3 bed around 500k and schedule a call with her ${DOW[d]} at 2pm`, async (bad) => { bad((await store.list("contacts", a.id)).some((c: any) => c.name === "Priya Shah"), "buyer missing"); bad((await evs(a, "call")).length === 1, "call missing"); }],
      [`lunch with Dana ${DOW[d]} at noon and a meeting ${DOW[d2]} at 3pm`, async (bad) => { bad((await evs(a)).length === 2, `${(await evs(a)).length} events`); }],
      [`I'm out of town ${DOW[d2]} and remind me to cancel the lawn guy ${DOW[d]} at 8am`, async (bad) => { bad((await evs(a)).some((e: any) => e.title === "Out of office"), "time off missing"); bad((await store.list("reminders", a.id)).length === 1, "reminder missing"); }],
    ];
    const [msg, check] = forms[i % forms.length];
    await scenario(`P${i} "${msg}"`, a, async (bad) => { await say(a, msg); await check(bad); });
  }
});

test("zz. conversation suite 2: zero failures", () => {
  console.log(`conversations2: ${total} scenarios, ${problems.length} failing`);
  if (problems.length) console.error(`\n${problems.length} conversation failures:\n` + problems.slice(0, Number(process.env.SHOW_FAILS ?? 40)).map((p) => " - " + p).join("\n"));
  assert.equal(problems.length, 0, `${problems.length} of ${total} conversations produced the wrong outcome`);
});
