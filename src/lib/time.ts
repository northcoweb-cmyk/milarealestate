// Timezone-aware date helpers built on Intl (no dependencies).

export const DAY_MS = 86_400_000;

export interface Parts { y: number; m: number; d: number; h: number; mi: number; dow: number }

export function partsIn(date: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", weekday: "short",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, dow: dows.indexOf(o.weekday) };
}

/** Convert a wall-clock time in `tz` to a UTC Date. */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const p = partsIn(new Date(t), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    const diff = asUtc - guess;
    if (diff === 0) break;
    t -= diff;
  }
  return new Date(t);
}

export function startOfDay(date: Date, tz: string): Date {
  const p = partsIn(date, tz);
  return zonedToUtc(p.y, p.m, p.d, 0, 0, tz);
}

export function addDays(date: Date, n: number, tz: string): Date {
  const p = partsIn(date, tz);
  return zonedToUtc(p.y, p.m, p.d + n, p.h, p.mi, tz);
}

export function sameDay(a: Date, b: Date, tz: string) {
  const x = partsIn(a, tz), y = partsIn(b, tz);
  return x.y === y.y && x.m === y.m && x.d === y.d;
}

export function fmtTime(date: Date | string, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(date));
}
export function fmtDay(date: Date | string, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date(date));
}
export function fmtShortDate(date: Date | string, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(date));
}
export function fmtDayTime(date: Date | string, tz: string) {
  return `${fmtDay(date, tz)} • ${fmtTime(date, tz)}`;
}
export function fmtRange(start: Date | string, end: Date | string, tz: string) {
  const s = fmtTime(start, tz), e = fmtTime(end, tz);
  const sm = s.slice(-2), em = e.slice(-2);
  return sm === em ? `${s.replace(` ${sm}`, "")}–${e}` : `${s}–${e}`;
}

export function relativeDays(date: Date | string, now: Date, tz: string): string {
  const a = startOfDay(new Date(date), tz).getTime();
  const b = startOfDay(now, tz).getTime();
  const n = Math.round((a - b) / DAY_MS);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return fmtDay(date, tz);
  return fmtShortDate(date, tz);
}

export function isValidTz(tz: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}
