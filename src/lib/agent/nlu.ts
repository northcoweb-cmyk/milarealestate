/**
 * Deterministic language understanding for the things real-estate agents say
 * all day: dates, times, addresses, names, budgets, bedrooms, timelines.
 * It is the free, instant first pass. When an AI provider is configured, the
 * LLM understander handles anything these rules can't classify and its output
 * is run through these same parsers (so dates are always resolved identically).
 */
import { addDays, partsIn, startOfDay, zonedToUtc } from "../time";

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** Short forms people actually type: longer ones first so "thurs" is not read as "thu" + junk. */
const WD_ABBR = ["tues", "thurs", "thur", "weds", ...WEEKDAYS.map((w) => w.slice(0, 3))].join("|");
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export const numWord = (s: string): number | null => {
  const t = s.toLowerCase();
  if (/^\d+$/.test(t)) return +t;
  return NUM_WORDS[t] ?? null;
};

// ------------------------------------------------------------------ time of day

export interface TimeOfDay { h: number; mi: number }
export interface TimeSpec { start: TimeOfDay; end?: TimeOfDay; explicit: boolean }

function to24(h: number, mi: number, mer?: string): TimeOfDay {
  let hh = h;
  if (mer) {
    const pm = mer.toLowerCase().startsWith("p");
    if (pm && hh < 12) hh += 12;
    if (!pm && hh === 12) hh = 0;
  } else if (hh >= 1 && hh <= 6) hh += 12; // bare "at 3" in a real-estate day means 3 PM
  else if (hh === 12) hh = 12;
  return { h: hh, mi };
}

/** Returns the offending token if the text contains an impossible clock time ("25:00", "13pm", "9:75"). */
export function invalidTimeToken(text: string): string | null {
  for (const m of text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) if (+m[1] > 23 || +m[2] > 59) return m[0];
  for (const m of text.matchAll(/\b(\d{1,2})(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z])/gi)) if (+m[1] > 12 || +m[1] === 0) return m[0].trim();
  return null;
}

const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Returns the offending phrase if the text names a day that cannot exist ("February 30", "the 45th", "October thirty fifth"), so it is asked about instead of guessed. */
export function invalidDateToken(text: string): string | null {
  const t = text.toLowerCase();
  for (const m of t.matchAll(new RegExp(`\\b(${MONTH_ABBR.join("|")})[a-z]*\\.?\\s+(\\d{1,3})(?:st|nd|rd|th)?\\b(?!\\s*(?::|am|pm|a\\.m|p\\.m))`, "g"))) {
    const day = +m[2];
    if (day < 1 || day > DAYS_IN[MONTH_ABBR.indexOf(m[1])]) return text.slice(m.index!, m.index! + m[0].length).trim();
  }
  for (const m of t.matchAll(/\bthe\s+(\d{1,3})(?:st|nd|rd|th)\b/g)) if (+m[1] < 1 || +m[1] > 31) return text.slice(m.index!, m.index! + m[0].length);
  // spoken: "october thirty fifth", "the forty first"
  for (const m of t.matchAll(new RegExp(`\\b(?:(?:${MONTH_ABBR.join("|")})[a-z]*|the)\\s+(thirty|forty|fifty|sixty|seventy|eighty|ninety)[-\\s]?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\\b`, "g"))) if (!(m[1] === "thirty" && m[2] === "first")) return text.slice(m.index!, m.index! + m[0].length);
  return null;
}

/** Parses "1 PM", "1:30pm", "1–3 PM", "from 10 to noon", "at three", "noon", "morning". */
export function parseTime(text: string): TimeSpec | null {
  const t = parseTimeRaw(text);
  // "tonight at 7" / "this evening at 6:30" with no am/pm means the evening
  if (t && !/\d\s*[ap]\.?m\b|\b[ap]\.?m\b|\bnoon\b|\bmidnight\b/i.test(text) && /\b(tonight|tonite|this evening|evening|at night)\b/i.test(text)) {
    const pm = (x: TimeOfDay) => (x.h >= 1 && x.h <= 11 ? { h: x.h + 12, mi: x.mi } : x);
    return { ...t, start: pm(t.start), end: t.end ? pm(t.end) : undefined };
  }
  return t;
}

function parseTimeRaw(text: string): TimeSpec | null {
  if (invalidTimeToken(text)) return null;
  const t = text.toLowerCase().replace(/[–—]/g, "-");
  const word = "(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
  const clock = `(\\d{1,2}|${word})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?`;
  const toNum = (s: string) => numWord(s) ?? 0;

  // "open house sat 1 to 4": a bare range right after a weekday is a start AND an end, never just a start
  const dayRange = /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+(?:from\s+)?(?:at\s+)?(1[0-2]|[1-9])(?::([0-5]\d))?\s*(?:to|-|until|till|til)\s*(1[0-2]|[1-9])(?::([0-5]\d))?(?![\d:]|\s*(?:bed|bath|br\b|ba\b|bd\b|people|min|hour|hr|day|week))/i.exec(t);
  if (dayRange && !/\d\s*(?:a\.?m\.?|p\.?m\.?)/i.test(t)) {
    const st = to24(+dayRange[1], dayRange[2] ? +dayRange[2] : 0);
    let en = to24(+dayRange[3], dayRange[4] ? +dayRange[4] : 0);
    if (en.h * 60 + en.mi <= st.h * 60 + st.mi) en = { h: Math.min(23, en.h + 12), mi: en.mi };
    return { start: st, end: en, explicit: true };
  }
  // "showing Thursday 11" / "lunch fri 1:30": a bare clock number right after a weekday is a time (never before bed/bath/people/units)
  const dayHour = /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+(?:at\s+)?(1[0-2]|[1-9])(?::([0-5]\d))?(?![\d:]|\s*(?:[ap]\.?m|st|nd|rd|th|bed|bath|br\b|ba\b|bd\b|people|min|hour|hr|day|week|month|year|%|\/|-|o['’]?clock|pm|am))/i.exec(t);
  const streetAfter = dayHour ? new RegExp(`^\\s+[a-z0-9'.]+(?:\\s+[a-z0-9'.]+){0,2}\\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|boulevard|pl|place|cir|circle|ter|terrace|pkwy|parkway|pike)\\b`, "i").test(t.slice((dayHour.index ?? 0) + dayHour[0].length)) : false;
  if (dayHour && !streetAfter && !/\b(?:half past|quarter (?:to|past|after))\b/i.test(t) && !/\d\s*(?:a\.?m\.?|p\.?m\.?)/i.test(t)) return { start: to24(+dayHour[1], dayHour[2] ? +dayHour[2] : 0), explicit: false };
  // spoken forms: "half past 2", "quarter to 3", "quarter after 4", "2 o'clock"
  const spoken = new RegExp(`\\b(half past|quarter past|quarter after|quarter to)\\s+(\\d{1,2}|${word})\\b`, "i").exec(t);
  if (spoken) {
    const h = toNum(spoken[2]); const kind = spoken[1].toLowerCase();
    if (h >= 1 && h <= 12) {
      const base = to24(h, 0).h;
      if (kind === "half past") return { start: { h: base, mi: 30 }, explicit: true };
      if (kind === "quarter to") return { start: { h: (base + 23) % 24, mi: 45 }, explicit: true };
      return { start: { h: base, mi: 15 }, explicit: true };
    }
  }
  const oclock = new RegExp(`\\b(\\d{1,2}|${word})\\s*o['’]?\\s*clock\\b`, "i").exec(t);
  if (oclock && toNum(oclock[1]) >= 1 && toNum(oclock[1]) <= 12) return { start: to24(toNum(oclock[1]), 0), explicit: true };
  const shortMer = /\b(\d{1,2})\s*([ap])(?![a-z.])/i.exec(t);
  if (shortMer && +shortMer[1] >= 1 && +shortMer[1] <= 12) return { start: to24(+shortMer[1], 0, shortMer[2] + "m"), explicit: true };

  // "1030am", "230pm"
  const compact = /(?<![\d:,.$])\b(\d{1,2})([0-5]\d)\s*([ap])\.?m\b\.?/i.exec(t);
  if (compact && +compact[1] >= 1 && +compact[1] <= 12) return { start: to24(+compact[1], +compact[2], compact[3] + "m"), explicit: true };
  // "two thirty", "five fifteen pm", "ten forty-five"
  const said = new RegExp(`\\b${word}\\s+(fifteen|thirty|forty[- ]?five)\\b\\s*(a\\.?m\\.?|p\\.?m\\.?)?`, "i").exec(t);
  if (said) return { start: to24(toNum(said[1]), /^f/.test(said[2]) && !/^forty/.test(said[2]) ? 15 : /^t/.test(said[2]) ? 30 : 45, said[3]), explicit: true };
  // "3ish", "around 3-ish"
  const ish = /\b(\d{1,2})\s*-?\s*ish\b/.exec(t);
  if (ish && +ish[1] >= 1 && +ish[1] <= 12) return { start: to24(+ish[1], 0), explicit: true };

  // ranges: "1-3 pm", "1 pm to 3 pm", "from 10 to noon"
  const range = new RegExp(`(?:from\\s+|between\\s+)?\\b${clock}\\s*(?:-|to|until|till)\\s*(noon|${clock})(?!\\d)`, "i").exec(t);
  if (range) {
    const [, h1, , m1, mer1, endRaw, h2, , m2, mer2] = range;
    // require a meridiem somewhere, or a clear range keyword, to avoid matching "3 to 4 bedrooms"
    const hasMer = mer1 || mer2;
    const afterRange = t.slice((range.index ?? 0) + range[0].length, (range.index ?? 0) + range[0].length + 12);
    const ctxWord = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b|\b(today|tomorrow|tonight)\b|\b(open house|showing|tour)\b/.test(t);
    if ((hasMer || endRaw === "noon" || (ctxWord && !m1 && !m2 && +h1 >= 1 && +h1 <= 12 && +(h2 ?? 0) >= 1 && +(h2 ?? 0) <= 12) || /^(from|between)\b/.test(range[0]) || /\bat\s*$/.test(t.slice(Math.max(0, (range.index ?? 0) - 6), range.index))) && !/^\s*(?:bed|br\b|bath|bd\b|hours?|hrs?\b|minutes?|mins?\b|miles?|mi\b|days?|weeks?|months?|years?|yrs?\b|k\b|%|people|units?|stor(?:y|ies)|floors?|blocks?|stars?)/.test(afterRange)) {
      const endMer = mer2 ?? mer1;
      const start = to24(toNum(h1), m1 ? +m1 : 0, mer1 ?? (mer2 && toNum(h1) <= toNum(h2 ?? "0") ? mer2 : mer2));
      const end = endRaw === "noon" ? { h: 12, mi: 0 } : to24(toNum(h2), m2 ? +m2 : 0, endMer);
      if (!hasMer && end.h <= start.h && end.h < 12) end.h += 12; // "11-1" → 11 AM to 1 PM
      if (end.h * 60 + end.mi > start.h * 60 + start.mi) return { start, end, explicit: true };
    }
  }

  if (/\bnoon(?:ish)?\b/.test(t)) return { start: { h: 12, mi: 0 }, explicit: true };
  if (/\bmidnight\b/.test(t)) return { start: { h: 0, mi: 0 }, explicit: true };

  const withMer = new RegExp(`\\b(\\d{1,2}|${word})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)(?![a-z])`, "i").exec(t);
  if (withMer) return { start: to24(toNum(withMer[1]), withMer[3] ? +withMer[3] : 0, withMer[4]), explicit: true };

  const colon = /\b(\d{1,2}):(\d{2})\b/.exec(t);
  if (colon) return { start: to24(+colon[1], +colon[2]), explicit: true };

  const at = new RegExp(`(?:\\b(?:at|to|around|by)\\s+|@\\s*)(\\d{1,2}|${word})(?![\\d,]|\\s*(?:bed|br|bath|k\\b|m\\b|%|people|units|min))`, "i").exec(t);
  if (at) {
    const n = toNum(at[1]);
    if (n >= 1 && n <= 12) return { start: to24(n, 0), explicit: true };
  }

  if (/\b(in the )?morning\b/.test(t)) return { start: { h: 9, mi: 0 }, explicit: false };
  if (/\b(in the )?afternoon\b/.test(t)) return { start: { h: 14, mi: 0 }, explicit: false };
  if (/\b(in the )?evening\b|\btonight\b/.test(t)) return { start: { h: 18, mi: 0 }, explicit: false };
  return null;
}

// ------------------------------------------------------------------------ date

export interface DateSpec { y: number; m: number; d: number; text: string; relative: boolean }

/** Resolve a calendar date from natural text in the user's timezone. */
export function parseDate(text: string, now: Date, tz: string): DateSpec | null {
  const t = text.toLowerCase().replace(/\b(tmrw|tmw|tmrw?|tomorow|tommorow|tomm?orrow)\b/g, "tomorrow").replace(/\bnxt\b/g, "next");
  const today = partsIn(now, tz);
  const mk = (offset: number, label: string, relative = true): DateSpec => {
    const p = partsIn(addDays(startOfDay(now, tz), offset, tz), tz);
    return { y: p.y, m: p.m, d: p.d, text: label, relative };
  };

  // "a week from Friday", "two weeks from today", "3 days after tomorrow"
  // "a day after tomorrow" / "3 days after tomorrow" -- but "around 2 day after tomorrow" is "day after tomorrow", and the 2 belongs to the time
  const away0 = new RegExp(`\\b(?:(a|an|one)\\s+(week|day)s?|(two|three|four|\\d+)\\s+(week|day)s)\\s+(?:from|after)\\s+(today|tomorrow|(?:next\\s+)?(?:${WEEKDAYS.join("|")}|${WD_ABBR}))\\b`).exec(t);
  const away = away0 && [away0[0], away0[1] ?? away0[3], away0[2] ?? away0[4], away0[5]];
  if (away) {
    const base = parseDate(away[3], now, tz);
    const n = (numWord(away[1]) ?? 1) * (away[2] === "week" ? 7 : 1);
    if (base) { const p = partsIn(addDays(zonedToUtc(base.y, base.m, base.d, 12, 0, tz), n, tz), tz); return { y: p.y, m: p.m, d: p.d, text: away[0], relative: true }; }
  }
  // "next week Tuesday" = Tuesday of next week
  const nextWeek = new RegExp(`\\bnext\\s+week\\s+(?:on\\s+)?(${WEEKDAYS.join("|")}|${WD_ABBR})\\b`).exec(t);
  if (nextWeek) { const d = parseDate(`next ${nextWeek[1]}`, now, tz); if (d) return { ...d, text: nextWeek[0] }; }
  // days that already happened: "yesterday", "last Friday", "3 days ago". The caller decides what to do with a past date (usually: ask).
  if (/\bday before yesterday\b/.test(t)) return mk(-2, "day before yesterday");
  if (/\byesterday\b/.test(t)) return mk(-1, "yesterday");
  const ago = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\s+ago\b/.exec(t);
  if (ago) return mk(-(numWord(ago[1]) ?? 0), ago[0]);
  const lastWd = new RegExp(`\\blast\\s+(${WEEKDAYS.join("|")}|${WD_ABBR})(?:day)?\\b`).exec(t);
  if (lastWd) { const idx = WEEKDAYS.findIndex((w) => w.startsWith(lastWd[1].slice(0, 3))); if (idx >= 0) return mk(-(((today.dow - idx + 7) % 7) || 7), lastWd[0]); }
  if (/\bday after tomorrow\b/.test(t)) return mk(2, "day after tomorrow");
  if (/\btomorrow\b/.test(t)) return mk(1, "tomorrow");
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t)) return mk(0, "today");

  const inN = /\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|week)s?\b/.exec(t);
  if (inN) { const n = numWord(inN[1]) ?? 0; return mk(inN[2] === "week" ? n * 7 : n, inN[0]); }

  if (/\bthis weekend\b/.test(t)) { const dow = today.dow; return mk(dow === 6 ? 0 : dow === 0 ? 0 : 6 - dow, "this weekend"); }

  // "the 25th" / "friday the 9th": next date whose day-of-month matches (and weekday, if given)
  const dom = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/.exec(t);
  if (dom && +dom[1] >= 1 && +dom[1] <= 31) {
    const wdName = new RegExp(`\\b(${WEEKDAYS.join("|")}|${WD_ABBR})\\b`).exec(t);
    for (let i = 0; i < 400; i++) {
      const p = partsIn(addDays(startOfDay(now, tz), i, tz), tz);
      if (p.d === +dom[1] && (!wdName || WEEKDAYS[p.dow].startsWith(wdName[1].slice(0, 3)))) return { y: p.y, m: p.m, d: p.d, text: dom[0], relative: false };
    }
  }

  const monthRe = new RegExp(`\\b(${MONTHS.join("|")}|sept|${MONTHS.map((m) => m.slice(0, 3)).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i").exec(t);
  if (monthRe) {
    const mi = MONTHS.findIndex((m) => m.startsWith(monthRe[1].slice(0, 3)));
    let y = monthRe[3] ? +monthRe[3] : today.y;
    const cand = zonedToUtc(y, mi + 1, +monthRe[2], 12, 0, tz);
    // a date a few weeks back ("Sept 20" on Oct 16) is that day this year, in the past; only older ones mean next year
    if (!monthRe[3] && cand.getTime() < startOfDay(now, tz).getTime() - 60 * 86_400_000) y += 1;
    return { y, m: mi + 1, d: +monthRe[2], text: monthRe[0], relative: false };
  }
  const slash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b(?!\s*(?:bed|bath|br\b|ba\b|bd\b))/.exec(t);
  if (slash && +slash[1] >= 1 && +slash[1] <= 12 && +slash[2] >= 1 && +slash[2] <= 31) {
    let y = slash[3] ? +slash[3] : today.y;
    if (y < 100) y += 2000;
    const cand = zonedToUtc(y, +slash[1], +slash[2], 12, 0, tz);
    if (!slash[3] && cand.getTime() < startOfDay(now, tz).getTime()) y += 1;
    return { y, m: +slash[1], d: +slash[2], text: slash[0], relative: false };
  }
  const wd = new RegExp(`\\b(?:(this|next|coming|on)\\s+)?(${WEEKDAYS.join("|")}|${WD_ABBR})(?:day)?\\b(?!\\s*(?:street|st\\b|ave|road|rd\\b))`, "i").exec(t);
  if (wd) {
    const idx = WEEKDAYS.findIndex((w) => w.startsWith(wd[2].slice(0, 3)));
    if (idx >= 0) {
      let diff = (idx - today.dow + 7) % 7;
      if (wd[1] === "next") diff = diff === 0 ? 7 : diff + (diff < 7 - today.dow && today.dow !== 0 ? 0 : 0) + (idx > today.dow ? 7 : 0);
      return mk(diff, wd[0].trim());
    }
  }

  return null;
}

export interface WhenSpec { start: Date | null; end: Date | null; date: DateSpec | null; time: TimeSpec | null }

export function parseWhen(textIn: string, now: Date, tz: string): WhenSpec {
  // "at 12 Oak Street" must not be read as "at 12 o'clock"
  const found = findAddress(textIn);
  const text = found ? textIn.replace(found.raw, " ") : textIn;
  const date = parseDate(text, now, tz);
  const time = parseTime(text);
  let start: Date | null = null, end: Date | null = null;
  if (date && time) {
    start = zonedToUtc(date.y, date.m, date.d, time.start.h, time.start.mi, tz);
    if (time.end) end = zonedToUtc(date.y, date.m, date.d, time.end.h, time.end.mi, tz);
  } else if (date) {
    start = zonedToUtc(date.y, date.m, date.d, 9, 0, tz);
  }
  return { start, end, date, time };
}

// --------------------------------------------------------------------- entities

const SUFFIX = "pike|plaza|row|run|loop|path|pass|point|ridge|crossing|walk|hill|park|street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|boul|way|place|pl|terrace|terr|ter|circle|cir|trail|trl|parkway|pkwy|pky|highway|hwy|square(?![.\\s]*f(?:t|eet|oot))|sq(?![.\\s]*f(?:t|eet|oot))";
/** words that are often part of a street NAME and are then followed by the real suffix ("Pine Ridge Rd", "Cherry Hill Ln", "Fox Run Dr", "Park Place") */
const NAMEY = "pike|plaza|row|run|loop|path|pass|point|ridge|crossing|walk|hill|park|square|sq";
const FORMAL = "street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|boul|way|place|pl|terrace|terr|ter|circle|cir|trail|trl|parkway|pkwy|pky|highway|hwy";
const DIRS = "(?:northeast|northwest|southeast|southwest|north|south|east|west|ne|nw|se|sw|[nsew])";

const MIXED = /^[A-Za-z][a-z']*[A-Z]/; // "McKinley", "O'Brien", "DeLuca": the agent already capitalised it deliberately
const titleCase = (s: string) => s.split(/(\s+)/).map((w) => {
  if (!w.trim()) return w;
  if (MIXED.test(w) && /[a-z]/.test(w)) return w;
  if (/[a-z]/.test(s) && /^[A-Z]{2,3}$/.test(w) && !/^(?:ST|AVE|RD|DR|LN|CT|PL|NE|NW|SE|SW|BLVD|TER|CIR|TRL|PKY|HWY|WAY|N|S|E|W)$/.test(w)) return w; // "QA", "JR": letters the agent typed in capitals stay
  return w.replace(/\b([a-z])([a-z']*)/gi, (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase().replace(/^'([a-z])/, (_m, c: string) => "'" + (a.toUpperCase() === "O" || a.toUpperCase() === "D" ? c.toUpperCase() : c)));
}).join("");

const SUFFIX_FULL: Record<string, string> = { st: "Street", ave: "Avenue", rd: "Road", dr: "Drive", ln: "Lane", ct: "Court", blvd: "Boulevard", boul: "Boulevard", pl: "Place", ter: "Terrace", terr: "Terrace", cir: "Circle", trl: "Trail", pkwy: "Parkway", pky: "Parkway", hwy: "Highway", sq: "Square" };

/** Finds a street address; returns the normalised form (and unit, e.g. "#4B") and the raw matched text. */
export function findAddress(text: string): { address: string; raw: string } | null {
  const num = "(\\d{1,6}[A-Za-z]?)";
  const wordRe = "(?:(?!(?:a\\.?m\\.?|p\\.?m\\.?)\\s)(?:[a-z][a-z0-9'.]*|\\d+(?:st|nd|rd|th))\\s+)";
  const dir = `(?:${DIRS}\\.?\\s+)?`;
  const tail = `(?:\\s+(?:ne|nw|se|sw)\\b\\.?)?`; // "1600 Penn Ave NW"
  const unit = `(?:\\s*,?\\s*(?:#\\s*|(?:apt|apartment|unit|suite|ste)\\.?\\s+#?)([a-z0-9][a-z0-9-]{0,5})(?![a-z0-9]))?`;
  const build = (body: string) => new RegExp(`(?<![\\d,.$])\\b${num}\\s+${dir}${body}${tail}${unit}`, "i");
  // "17 St. Mary's Rd": "St." right after the number is Saint, not the street suffix
  const saint = build(`(?:st\\.|saint)\\s+(?:[a-z][a-z0-9'.]*\\s+){0,2}?(?:${SUFFIX})\\b\\.?`);
  const plain = build(`(?:${wordRe}){0,4}?(?:(?:${NAMEY})\\s+(?:${FORMAL})|(?:${SUFFIX}))\\b\\.?`);
  // words that can't be part of a street name: "5 captions for the Oak St" is a request, not an address
  const NOT_STREET = /^(?:for|the|an?|and|at|on|in|to|with|from|my|our|your|me|this|that|it|is|are|was|you|can|please|pls|make|create|write|need|bed|beds|bd|br|bath|baths|ba|posts?|captions?|carousels?|stories|story|am|pm)$/i;
  const valid = (x: RegExpExecArray | null) => !!x && !x[0].replace(/^\S+\s+/, "").split(/\s+/).slice(0, -1).some((w) => NOT_STREET.test(w.replace(/[.,]$/, "")));
  const sm = saint.exec(text);
  let m: RegExpExecArray | null = valid(sm) ? sm : null;
  if (!m) {
    const g = new RegExp(plain.source, "gi");
    for (let x = g.exec(text); x; x = g.exec(text)) {
      if (valid(x)) { m = x; break; }
      g.lastIndex = x.index + 1; // the number may still start a real address further along ("3 bed 2 bath, 12 Oak St")
    }
  }
  if (!m) return null;
  // m[1] = number(+letter); rebuild the street part from the raw match, minus the unit
  let street = m[0];
  let unitTxt = "";
  if (m[2]) { const u = new RegExp(`\\s*,?\\s*(?:#\\s*|(?:apt|apartment|unit|suite|ste)\\.?\\s+#?)${m[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").exec(street); if (u) { street = street.slice(0, u.index); unitTxt = ` #${m[2].toUpperCase()}`; } }
  street = street.replace(/\.$/, "");
  const words = titleCase(street.replace(/^(\d{1,6})([A-Za-z])\b/, (_x, n: string, l: string) => n + l.toUpperCase())).split(/\s+/).map((w, i, all) => {
    const bare = w.replace(/\.$/, "");
    if (i > 0 && i < all.length - 1 && /^(?:[nsew]|ne|nw|se|sw)$/i.test(bare)) return bare.toUpperCase() + (w.endsWith(".") ? "." : ""); // "n." → "N.", "sw" → "SW" // "N." → "N", "Sw" → "SW"
    if (i === all.length - 1 && /^(ne|nw|se|sw)$/i.test(bare) && all.length > 3) return bare.toUpperCase();
    return w;
  });
  // the suffix: last word that is a known suffix (a trailing NW/SE stays as written)
  const li = words.length - 1 - (/^(NE|NW|SE|SW)$/.test(words[words.length - 1]) && words.length > 3 ? 1 : 0);
  const last = words[li].replace(/\.$/, "").toLowerCase();
  if (SUFFIX_FULL[last]) words[li] = SUFFIX_FULL[last];
  return { address: words.join(" ") + unitTxt, raw: m[0] };
}

/** Two ways of writing the same street address compare equal ("77 W. Main St" = "77 w main street"). */
export const addrKey = (a: string) => a.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

export function parseAddress(text: string): string | null {
  return findAddress(text)?.address ?? null;
}

export function parseMoney(text: string): { min: number | null; max: number | null } {
  const t = text.slice(0, 5000).toLowerCase().replace(/,/g, ""); // bounded: these regexes are not linear on huge input
  const one = (s: string, u?: string) => {
    let n = parseFloat(s);
    if (u === "k" || u === "thousand") n *= 1000;
    if (u === "m" || u === "million" || u === "mm") n *= 1_000_000;
    return Math.round(n);
  };
  const rng = /\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?(?![a-z])\s*(?:-|to)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?(?![a-z])/.exec(t);
  if (rng && (rng[2] || rng[4] || /\$/.test(rng[0]))) {
    const u2 = rng[4] ?? rng[2];
    return { min: one(rng[1], rng[2] ?? u2), max: one(rng[3], u2) };
  }
  const m = /(?:\$\s*(\d+(?:\.\d+)?)\s*(k|m|million|thousand|mm)?(?![a-z])|\b(\d+(?:\.\d+)?)\s*(k|m|million|thousand|mm)\b)/.exec(t);
  if (!m) return { min: null, max: null };
  const val = m[1] ? one(m[1], m[2]) : one(m[3], m[4]);
  if (val < 1000 && !m[2] && !m[4]) return { min: null, max: null };
  return { min: null, max: val };
}

export function parseBeds(text: string): number | null {
  const m = new RegExp(`\\b(\\d+|one|two|three|four|five|six)\\s*\\+?\\s*[- ]?(?:bed(?:room)?s?|br|bd)\\b`, "i").exec(text);
  return m ? numWord(m[1]) : null;
}
export function parseBaths(text: string): number | null {
  const m = /\b(\d+(?:\.\d)?|one|two|three|four)\s*\+?\s*[- ]?(?:bath(?:room)?s?|ba)\b/i.exec(text);
  if (!m) return null;
  return /^\d/.test(m[1]) ? +m[1] : numWord(m[1]);
}

export function parseTimeline(text: string): string | null {
  const t = text.toLowerCase();
  const m = /\b(?:in|within|over|during)?\s*(?:the\s+)?next\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(day|week|month|year)s?\b/.exec(t)
    ?? /\bwithin\s+(\d+|one|two|three|four|five|six|twelve)\s+(day|week|month|year)s?\b/.exec(t)
    ?? /\bin\s+(?:about\s+|around\s+)?(\d+|one|two|three|four|five|six|twelve)\s+(month|week|year)s?\b/.exec(t);
  if (m) { const n = numWord(m[1]); return `Next ${n} ${m[2]}${n === 1 ? "" : "s"}`; }
  if (/\basap\b|\bright away\b|\bimmediately\b/.test(t)) return "ASAP";
  // "thinking of listing in the spring" / "wants to buy by summer" / "moving next fall" / "closing in March"
  const season = /\b(?:(next|this|early|late)\s+)?(spring|summer|fall|autumn|winter)\b/.exec(t);
  if (season && /\b(?:in|by|before|this|next|early|late|for|during)\b/.test(t.slice(Math.max(0, (season.index ?? 0) - 14), season.index ?? 0) + " " + (season[1] ?? ""))) return `${season[1] ? season[1][0].toUpperCase() + season[1].slice(1) + " " : ""}${season[2][0].toUpperCase() + season[2].slice(1)}`;
  const mon = /\b(?:in|by|before|around)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b(?!\s+\d)/.exec(t);
  if (mon) return mon[1][0].toUpperCase() + mon[1].slice(1);
  if (/\bthis (spring|summer|fall|winter)\b/.test(t)) return /\bthis (spring|summer|fall|winter)\b/.exec(t)![0].replace(/^./, (c) => c.toUpperCase());
  if (/\b(just|only)\s+(starting|browsing|looking)|no rush|someday\b/.test(t)) return "No rush";
  return null;
}

export function parseEmail(text: string): string | null {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text.slice(0, 5000))?.[0].toLowerCase() ?? null;
}
export function parsePhone(text: string): string | null {
  const m = /(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/.exec(text.slice(0, 5000));
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : null;
}

const NAME_STOP = new Set(["Is","Are","Does","Do","Did","Was","Were","What","When","Where","Who","How","Why","Which","Can","Could","Should","Would","Will","Hi","Hello","Dear","Hey","Now","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","January","February","March","April","May","June","July","August","September","October","November","December","Mila","Give","Write","Make","Draft","Create","Send","Show","Find","Pull","Get","Set","Help","Please","Can","Could","Would","Should","Open","House","Showing","Main","Street","I","I'm","And","The","She","He","They","Montgomery","County"]);

/** Keeps the whole typed name (up to four words when it starts with two ALL-CAPS tags, else three) and drops trailing day/month words. */
function tidyName(raw: string): string {
  const toks = raw.trim().split(/\s+/).map((t, i, a) => (i === a.length - 1 ? t.replace(/['’]s$/i, "").replace(/[,.;:!?]+$/, "") : t));
  while (toks.length > 1 && (NAME_STOP.has(toks[toks.length - 1]) || /^(?:oh|ok|okay|um|uh|so|then|and|but|too|please)$/i.test(toks[toks.length - 1]))) toks.pop();
  const lead = toks.filter((t) => /^[A-Z]{2,}$/.test(t)).length >= 2 && /^[A-Z]{2,}$/.test(toks[0]) && /^[A-Z]{2,}$/.test(toks[1]);
  const title = /^(?:Dr|Mr|Mrs|Ms|Mx|Prof|Rev)\.?$/.test(toks[0]) ? 1 : 0;
  return toks.slice(0, (lead ? 4 : 3) + title).join(" ");
}

export function parsePersonName(text: string): string | null {
  const W = "\\p{Lu}[\\p{L}'’-]*";
  // a couple: "Dave and Linda Kim" is one household, saved as "Dave & Linda Kim"
  const couple = new RegExp(`\\b(${W})\\s+(?:and|&)\\s+(${W})\\s+(${W})\\b`, "u").exec(text);
  if (couple && !NAME_STOP.has(couple[1]) && !/@/.test(couple[0])) return `${couple[1]} & ${couple[2]} ${couple[3]}`;
  const NM = `((?:(?:Dr|Mr|Mrs|Ms|Mx|Prof|Rev)\\.?\\s+)?${W}(?:\\s+${W}){0,3})`;
  // a household: "the Lutz family" / "the Brennans"
  const fam = new RegExp(`\\b[Tt]he\\s+(${W})\\s+[Ff]amily\\b`, "u").exec(text);
  if (fam && !NAME_STOP.has(fam[1])) return `${fam[1]} Family`;
  const named = new RegExp(`\\b(?:named|called|name is|name's)\\s+${NM}`, "u").exec(text);
  if (named) return tidyName(named[1]);
  // "Priya Shah is a new buyer, wants…" / "my new client is Lisa Gray"
  const subj = new RegExp(`^\\s*${NM}\\s+(?:is|are|'s)\\s+(?:a|an|my)\\s+(?:new\\s+)?(?:buyer|seller|renter|tenant|investor|lead|client|prospect)\\b`, "u").exec(text);
  if (subj && !NAME_STOP.has(subj[1].split(" ")[0])) return tidyName(subj[1]);
  // "spoke with Greg Hall, he wants to buy" / "just met Dana Cole"
  const met = new RegExp(`\\b(?:spoke\\s+(?:to|with)|talked\\s+(?:to|with)|chatted\\s+with|met(?:\\s+with)?|ran\\s+into|(?:phone|call)\\s+with)\\s+(?:an?\\s+)?${NM}`, "u").exec(text);
  if (met && !NAME_STOP.has(met[1].split(" ")[0])) return tidyName(met[1]);
  const asA = new RegExp(`\\b(?:buyer|seller|renter|tenant|investor|lead|client|prospect)\\s*(?:[,:-]|\\bis\\b)?\\s+${NM}`, "u").exec(text);
  if (asA && !NAME_STOP.has(asA[1].split(" ")[0])) return tidyName(asA[1]);
  const addAs = new RegExp(`\\b[Aa]dd\\s+${NM}\\s+as\\b`, "u").exec(text);
  if (addAs) return tidyName(addAs[1]);
  const addRole = new RegExp(`\\b[Aa]dd\\s+${NM}\\s+(?:buyer|seller|renter|tenant|investor|lead|client|prospect)\\b`, "u").exec(text); // "add Zoe Park buyer 301-555-0177"
  if (addRole && !NAME_STOP.has(addRole[1].split(" ")[0])) return tidyName(addRole[1]);
  const addBare = new RegExp(`^\\s*(?:please\\s+)?[Aa]dd\\s+(?:a\\s+|another\\s+)?(?:new\\s+)?(?:contact\\s+|person\\s+)?(?:named\\s+|called\\s+)?${NM}\\s*[.!]*$`, "u").exec(text);
  if (addBare && !NAME_STOP.has(addBare[1].split(" ")[0])) return tidyName(addBare[1]);
  return lowercaseName(text);
}

const NAME_END = new Set(["already", "comeon", "come", "please", "pls", "now", "asap", "today", "yet", "again", "really", "just", "ok", "okay", "yes", "yeah", "lol", "looking", "who", "wants", "want", "with", "is", "in", "around", "for", "and", "budget", "from", "at", "interested", "needs", "need", "has", "have", "he", "she", "they", "his", "her", "their", "just", "a", "an", "the", "to", "under", "over", "about", "searching", "seeking", "hoping", "moving", "relocating", "pre", "preapproved", "ready", "i", "my", "we", "email", "phone", "cell", "number", "as", "wanting", "thinking", "trying", "referred", "found", "new", "met", "called", "named", "name", "yesterday", "today", "tomorrow", "tonight", "this", "last", "next", "week", "weekend", "morning", "afternoon", "evening", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "earlier", "recently", "now", "again", "also", "but", "so", "because", "that", "which", "when", "where", "how", "if", "then", "was", "were", "are", "will", "would", "can", "could", "should", "may", "might", "does", "did", "had", "been", "of", "on", "by", "up", "out", "me", "you", "it", "its", "there", "here", "too", "very", "really", "pretty", "kind", "sort", "based", "age", "aged", "year", "years", "old"]);
const properCase = (s: string) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
/** Fast typing, no capitals: "new buyer named dana whitfield looking for…", "add mike johnson as a buyer". */
function lowercaseName(text: string): string | null {
  const word = "[\\p{L}'’-]+(?=[\\s,.;:]|$)";
  const grab = (re: RegExp) => {
    const m = re.exec(text);
    if (!m) return null;
    const out: string[] = [];
    for (const w of m[1].trim().split(/\s+/)) { const bare = w.toLowerCase().replace(/[,.;:]+$/, ""); if (NAME_END.has(bare) || (bare.length > 4 && bare.endsWith("ing"))) break; out.push(w.replace(/[,.;:]+$/, "")); if (/[,.;:]$/.test(w) || out.length === 3) break; }
    return out.length && !out.every((w) => GENERIC_WORD.test(w)) ? properCase(out.join(" ")) : null;
  };
  return grab(new RegExp(`\\b(?:named|called|name is|name's)\\s+((?:${word}\\s*){1,4})`, "iu"))
    ?? grab(new RegExp(`\\b(?:buyer|seller|renter|tenant|investor|lead|client|prospect)\\s*[,:-]?\\s+((?:${word}\\s*){1,4})`, "iu"))
    ?? grab(new RegExp(`\\badd\\s+((?:${word}\\s*){1,3}?)\\s+as\\b`, "iu"));
}

/** Capitalised name tokens mentioned anywhere (used to match existing contacts). */
export function capitalisedNames(text: string): string[] {
  const out: string[] = [];
  // a test/label tag in capitals goes with the name after it: "QA TEST Maya" is one person, not "QA TEST" and "Maya"
  const tagged = /(?<![\p{L}])((?:[A-Z]{2,5}\s+){2,3}\p{Lu}\p{Ll}[\p{L}'’-]*(?:\s+\p{Lu}\p{Ll}[\p{L}'’-]*)?)/gu;
  for (const t of text.matchAll(tagged)) out.push(t[1].trim());
  text = text.replace(tagged, " ");
  const re = /(?<![\p{L}])(\p{Lu}[\p{L}'’-]+)(?:\s+(\p{Lu}[\p{L}'’-]+))?/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (NAME_STOP.has(m[1])) continue;
    out.push(m[2] && !NAME_STOP.has(m[2]) ? `${m[1]} ${m[2]}` : m[1]);
  }
  return out;
}

export function parseLocation(text: string): string | null {
  const county = /\b((?:[A-Z][a-z]+\s+)+County)\b/.exec(text);
  if (county) return county[1];
  const m = /\b(?:in|around|near|within|throughout)\s+((?:[A-Z][a-zA-Z.'-]+)(?:\s+[A-Z][a-zA-Z.'-]+){0,2}(?:,\s*[A-Z]{2})?)(?=[\s,.!?]|$)/.exec(text);
  if (m && !NAME_STOP.has(m[1])) return m[1].replace(/\.(?=,)/g, "").replace(/,\s*([A-Z]{2})(?:,\s*\1)+/g, ", $1"); // "Rockville., MD, MD" is "Rockville, MD"
  return null;
}

export type ContactTypeGuess = "buyer" | "seller" | "rental" | "investor" | "lead" | "past_client" | null;
export function parseContactType(text: string): ContactTypeGuess {
  const t = text.toLowerCase();
  if (/\bpast client\b/.test(t)) return "past_client";
  if (/\binvestors?\b/.test(t)) return "investor";
  if (/\b(renters?|tenants?|rental client|looking to rent|rental)\b/.test(t)) return "rental";
  if (/\bsellers?\b|\blisting (?:my|their|her|his)\b|\bsell(?:ing)? (?:my|her|his|their)\b/.test(t)) return "seller";
  if (/\bbuyers?\b|\blooking (?:to buy|for a (?:house|home|condo|townhome))\b/.test(t)) return "buyer";
  if (/\blead\b/.test(t)) return "lead";
  return null;
}

/** Split compound requests ("remind me Friday to call Sarah and also move my showing to three"). */
export function splitClauses(text: string): string[] {
  text = text.slice(0, 6000); // bounded first: the patterns below are not linear on huge input
  // a single question ("What's Victor's phone, email and budget?") is one request, even though its list contains words like "email"
  if (/^\s*(?:what|who|which|when|where|how|is|are|do|does|did|can|could)\b/i.test(text) && /\?\s*$/.test(text) && !/[;]|\?.+\?/.test(text)) return [text];
  // a long paste of notes (several sentences) is separate requests, one per sentence, never one merged reminder
  if (text.length > 160) { const sents = text.replace(/^\s*(?:my\s+)?notes?(?:\s+(?:from|on)\s+[^:.]{1,30})?\s*:\s*/i, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim().replace(/^(?:also|and|then)[, ]+/i, "")).filter(Boolean);
    const ACT = /^(?:remind|call|text|txt|email|e-mail|schedule|book|add|set up|setup|create|cancel|move|reschedule|draft|send|follow up|make|put|log|update|mark|open house|showing|prep|write|ask)\b|\bremind me\b/i;
    // sentences that only describe something are shown as "noted", never turned into a booking, reminder or property edit
    if (sents.length >= 3 && sents.length <= 14 && !(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).length && sents.some((x) => ACT.test(x))) return sents.map((x) => (ACT.test(x) ? x : `\u0001${x}`)); }
  // a pasted list of people ("Ann ann@x.com; Bob bob@y.com") is one request, not several
  if ((text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).length >= 2) return [text];
  // "Book a showing at 5 and another at 5:30" → two showings
  const another = /^(.*?\b(showing|meeting|call|appointment|inspection|tour|lunch|walkthrough)s?\b.*?)\s+and\s+(?:another|one more|a second)\s+(?:(?:showing|meeting|call|appointment|inspection|tour|lunch|walkthrough)\s+)?(.+)$/i.exec(text.trim());
  if (another) return [another[1].trim(), `${another[2]} ${another[3]}`.trim()];
  // "showing at 101 Oak Lane tomorrow at 2pm, lunch Friday at noon": a comma before a second booking that has its own day or time is a second request
  { const pieces = text.split(/,\s+(?=(?:an?\s+|another\s+)?(?:showing|meeting|call|appointment|inspection|tour|lunch|dinner|coffee|walkthrough|closing|open house)\b)/i);
    if (pieces.length > 1 && pieces.every((x) => /\b\d{1,2}(?::\d\d)?\s*(?:am|pm)\b|\bnoon\b|\bat\s+\d/i.test(x))) return pieces.map((x) => x.trim()).filter(Boolean); }
  const parts = text
    .split(/\s*(?:;|,\s*(?:and\s+)?(?=(?:remind me|email|e-mail|text|draft|add|book|schedule|cancel|move|reschedule|set up|create)\b(?!\s*(?:is\s+|address\s+|:\s*)?(?:[\w.+-]+@|\d)))|\band also\b|\balso,?\s+(?=(?:remind|move|schedule|add|draft|email|text|set|create|cancel|delete|remove|find|make))|\band then\b(?=\s+(?:remind|move|reschedule|schedule|cancel|add|book|draft|email|text|send|set|create|call|follow|make|find|put|log|update|mark)\b)|,\s*then\b|[.!]\s+(?=(?:please\s+)?(?:get me |help me |can you |could you )?(?:prep(?:are)?|get (?:me )?(?:ready|prepared))\b)|[.!]\s+(?=(?:what(?:'s| is)|what am i|anything)\b[^.?!]*\bmissing\b))\s*/i)
    .map((s) => s.trim())
    .filter((s) => s && !/^(?:oh|ok|okay|and|also|so|um+|uh+|hey|wait|actually)[.,!\s]*$/i.test(s)); // "oh and also cancel Monday" leaves one request, not a stray "oh"
  // "… and remind me …", "… and move my …" start a new clause when followed by an action verb
  const out: string[] = [];
  for (const p of parts) {
    const sub = p.split(/\s+and\s+(?=(?:remind me|move|reschedule|schedule|cancel|delete|remove|draft|email|text|set up|add\b|book\b|put\b|send\b|tell\b|create|make|find)\b)/i);
    // "lunch with Dana Saturday at noon and a meeting Monday at 3pm": a second booking with its own day/time is its own request
    for (const piece of sub) {
      const again = piece.split(/\s+and\s+(?=(?:(?:an?|another)\s+)?(?:showing|meeting|call|appointment|inspection|tour|lunch|dinner|coffee|walkthrough|closing|open house)\b)/i);
      const merged: string[] = [];
      for (const [i, x] of again.entries()) {
        if (i > 0 && !(parseDate(x, new Date(), "UTC") || parseTime(x))) merged[merged.length - 1] += ` and ${x}`;
        else merged.push(x);
      }
      out.push(...merged.map((s) => s.trim()).filter(Boolean));
    }
  }
  return out.length ? out : [text];
}

export function stripPunct(s: string) { return s.replace(/[.!?]+$/, "").trim(); }

// ------------------------------------------------------------------ corrections
const WD = "(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?";
const MON = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_ALT = `day after tomorrow|tomorrow|tmrw|tmw|today|tonight|this weekend|(?:this|next|on|coming)\\s+${WD}|${WD}(?:\\s+the\\s+\\d{1,2}(?:st|nd|rd|th))?|the\\s+\\d{1,2}(?:st|nd|rd|th)|${MON}\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|in\\s+(?:\\d+|one|two|three|four|five|six|seven)\\s+(?:day|week)s?`;
const DATE_WORDS = new RegExp(`\\b(?:${DATE_ALT})\\b`, "gi");
const TIME_WORDS = /\b(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)(?:\s*(?:-|to|until)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)?|(?:half past|quarter (?:to|past))\s+\w+|noon|midnight|at\s+\d{1,2}(?::\d{2})?|(?:at\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:fifteen|thirty|forty[- ]?five)(?:\s*(?:a\.?m\.?|p\.?m\.?))?|at\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s*(?:a\.?m\.?|p\.?m\.?|o['’]?clock))?)(?=\W|$)/gi;

/**
 * When someone corrects an earlier request ("sorry, the one for today Saturday"), the new date/time REPLACES the old one
 * instead of being tacked on after it (which made Mila keep asking about the old "Sunday").
 */
export function overrideWhen(orig: string, reply: string, now: Date, tz: string): string {
  const addr = findAddress(orig);
  const protectedRaw = addr?.raw;
  let o = protectedRaw ? orig.replace(protectedRaw, "\u0001") : orig;
  const replyDate = parseDate(protectedRaw ? reply : reply, now, tz);
  const replyTime = parseTime(reply);
  if (replyDate) o = o.replace(DATE_WORDS, " ");
  if (replyTime?.explicit) o = o.replace(TIME_WORDS, " ");
  if (protectedRaw) o = o.replace("\u0001", protectedRaw);
  return o.replace(/\s{2,}/g, " ").trim();
}

/** The words of a request with the date/time phrases taken out ("call Dana tomorrow at 9am" → "call Dana"). */
export function stripWhenWords(text: string): string {
  return text
    .replace(/\bin\s+(?:\d+(?:\.\d+)?|an?|one|two|three|four|five|half an?)\s*(?:hours?|hrs?|minutes?|mins?)\b/gi, " ")
    .replace(/\b(?:on|for|by|at|around)?\s*(?:\d{1,2})(?:\d{2})?\s*(?:a|p)\.?m\.?\b/gi, " ")
    .replace(DATE_WORDS, " ").replace(TIME_WORDS, " ")
    .replace(/\bnext\s+week\b/gi, " ")
    .replace(/\s+(?:on|at|for|by|around)\s*$/i, " ").replace(/^\s*(?:on|at|for|by)\s+/i, "")
    .replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

/** "actually Wednesday not Saturday" → "actually Wednesday": drop the day being corrected away from. */
export function dropNegatedDate(reply: string): string {
  return reply.replace(new RegExp(`\\b(?:and\\s+)?(?:not|instead of|rather than)\\s+(?:on\\s+)?(?:${DATE_ALT})\\b`, "gi"), " ").replace(/\s{2,}/g, " ").trim();
}

const NOT_A_NAME = /\b(already|told|tell|please|pls|comeon|come on|asap|whatever|hello|hey|thanks|thank|yes|yeah|nope|nothing|everything|something|anyone|everyone|asdf|poop|lol|wtf|damn|stupid|dumb|why|what|how|when|where|who)\b/i;
/** A real person's name: 1-4 words, letters, no punctuation runs, no chat filler. Stops "i already told you..." or "Already Comeon" from becoming a contact. */
export function plausibleName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().replace(/^(Dr|Mr|Mrs|Ms|Mx|Prof|Rev)\.\s+/i, "$1 "); // a title like "Dr." may carry its period
  if (n.length < 2 || n.length > 60) return false;
  if (/[.!?:;@#$%^*()=+<>\[\]{}|\\/\d]|\.{2,}/.test(n)) return false;
  const words = n.split(/\s+/);
  if (words.length > 4) return false;
  // ordinary words are never a person: "buyer agent" -> "Agent", "seller credit" -> "Credit", "rename that new buyer profile" -> "Profile"
  if (words.every((w) => GENERIC_WORD.test(w))) return false;
  return !words.some((w) => NOT_A_NAME.test(w));
}
const GENERIC_WORD = /^(?:agent|agents|profile|credit|credits|referral|contact|contacts|client|clients|buyer|buyers|seller|sellers|lead|leads|person|people|someone|somebody|family|couple|the|a|an|is|are|hi|hello|his|her|their|my|our|new|another|other|that|this|it|them|him|she|he|they|we|you|me|us|mila|home|house|listing|property|offer|price|note|notes|name|email|phone|number|address)$/i;

/**
 * "Thursday at 9am" said on Thursday afternoon means NEXT Thursday: when the time named has already passed today and the agent named a
 * weekday (not "today" or "tonight"), roll it a week forward instead of telling her it already passed.
 */
export function rollPastWeekday(start: Date, text: string, now: Date, tz: string): Date {
  if (start.getTime() >= now.getTime() - 60_000) return start;
  if (/\b(today|tonight|this (?:morning|afternoon|evening)|earlier)\b/i.test(text)) return start;
  if (!/\b(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)[a-z]*\b/i.test(text)) return start;
  const a = partsIn(start, tz), b = partsIn(now, tz);
  if (a.y !== b.y || a.m !== b.m || a.d !== b.d) return start; // it named an earlier day, not today: leave it to the "already passed" answer
  return new Date(start.getTime() + 7 * 86_400_000);
}
