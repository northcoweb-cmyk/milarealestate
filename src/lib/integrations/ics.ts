/**
 * Calendar-by-link sync: Apple Calendar (iCloud "Public Calendar" link), Google's "secret address in iCal format",
 * Outlook's "Publish calendar" link, or any .ics feed. Read-only: Mila pulls the next 60 days so conflict checks see everything.
 * No password is ever asked for; the link itself is the permission, so it is stored encrypted and can be removed any time.
 */
import { zonedToUtc, partsIn } from "../time";

export interface IcsEvent { uid: string; summary: string; start: Date; end: Date; location: string | null; cancelled: boolean }

const unescapeText = (s: string) => s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\").trim();

/** "webcal://x" and "webcals://x" are just https. */
export function normalizeCalendarLink(raw: string): string | null {
  const t = raw.trim().replace(/^webcals?:\/\//i, "https://");
  try { const u = new URL(t); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null; } catch { return null; }
}

function parseDateValue(value: string, params: string, fallbackTz: string): { d: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, da] = [+m[1], +m[2], +m[3]];
  if (m[4] === undefined) return { d: new Date(Date.UTC(y, mo - 1, da)), allDay: true };
  const h = +m[4], mi = +m[5];
  if (m[7]) return { d: new Date(Date.UTC(y, mo - 1, da, h, mi)), allDay: false };
  const tz = /TZID=([^;:]+)/i.exec(params)?.[1]?.replace(/^"|"$/g, "") ?? fallbackTz;
  try { return { d: zonedToUtc(y, mo, da, h, mi, tz), allDay: false }; } catch { return { d: zonedToUtc(y, mo, da, h, mi, fallbackTz), allDay: false }; }
}

/** Parse the events (timed ones only; all-day entries don't block a showing) in a window, expanding simple repeats. */
export function parseIcs(text: string, opts: { from: Date; to: Date; tz: string }): IcsEvent[] {
  const lines = text.replace(/\r/g, "").replace(/\n[ \t]/g, "").split("\n"); // unfold
  const out: IcsEvent[] = [];
  let cur: Record<string, { v: string; p: string }[]> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur) out.push(...expand(cur, opts));
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const left = line.slice(0, i), v = line.slice(i + 1);
    const semi = left.indexOf(";");
    const name = (semi < 0 ? left : left.slice(0, semi)).toUpperCase(), p = semi < 0 ? "" : left.slice(semi + 1);
    (cur[name] ??= []).push({ v, p });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function expand(e: Record<string, { v: string; p: string }[]>, { from, to, tz }: { from: Date; to: Date; tz: string }): IcsEvent[] {
  const ds = e.DTSTART?.[0]; if (!ds) return [];
  const start = parseDateValue(ds.v, ds.p, tz); if (!start || start.allDay) return [];
  const de = e.DTEND?.[0] ? parseDateValue(e.DTEND[0].v, e.DTEND[0].p, tz) : null;
  const dur = Math.max(15 * 60_000, de && !de.allDay ? de.d.getTime() - start.d.getTime() : 3_600_000);
  const uid = e.UID?.[0]?.v ?? `${ds.v}-${e.SUMMARY?.[0]?.v ?? ""}`;
  const base = { summary: unescapeText(e.SUMMARY?.[0]?.v ?? "Busy") || "Busy", location: e.LOCATION?.[0]?.v ? unescapeText(e.LOCATION[0].v) : null, cancelled: /CANCELLED/i.test(e.STATUS?.[0]?.v ?? "") };
  const skip = new Set((e.EXDATE ?? []).flatMap((x) => x.v.split(",")).map((x) => parseDateValue(x, "", tz)?.d.getTime()).filter((x): x is number => !!x));
  const rule = e.RRULE?.[0]?.v;
  const mk = (s: Date) => ({ ...base, uid: `${uid}@${s.toISOString()}`, start: s, end: new Date(s.getTime() + dur) });
  if (!rule) return start.d < to && new Date(start.d.getTime() + dur) > from ? [{ ...mk(start.d), uid }] : [];
  const r = Object.fromEntries(rule.split(";").map((kv) => kv.split("=") as [string, string]));
  const until = r.UNTIL ? parseDateValue(r.UNTIL, "", tz)?.d ?? null : null;
  const count = r.COUNT ? Math.min(+r.COUNT, 400) : 400, interval = Math.max(1, +(r.INTERVAL ?? 1));
  const wd = (r.BYDAY ?? "").split(",").map((x) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].indexOf(x.slice(-2))).filter((x) => x >= 0);
  const res: IcsEvent[] = [];
  const startParts = partsIn(start.d, tz);
  for (let day = 0, n = 0; day < 800 && n < count; day++) {
    const probe = new Date(start.d.getTime() + day * 86_400_000);
    const pp = partsIn(probe, tz);
    const s = zonedToUtc(pp.y, pp.m, pp.d, startParts.h, startParts.mi, tz);
    if (until && s > until) break;
    if (s > to) break;
    let hit = false;
    if (r.FREQ === "DAILY") hit = day % interval === 0;
    else if (r.FREQ === "WEEKLY") hit = Math.floor(day / 7) % interval === 0 && (wd.length ? wd.includes(pp.dow) : pp.dow === startParts.dow);
    else if (r.FREQ === "MONTHLY") hit = pp.d === startParts.d && ((pp.y - startParts.y) * 12 + pp.m - startParts.m) % interval === 0;
    else if (r.FREQ === "YEARLY") hit = pp.d === startParts.d && pp.m === startParts.m;
    if (!hit) continue;
    n++;
    if (skip.has(s.getTime())) continue;
    if (new Date(s.getTime() + dur) > from) res.push(mk(s));
  }
  return res;
}

// ---------------------------------------------------------------- sync into Mila
import { getStore } from "../db/store";
import { decrypt, encrypt } from "./crypto";
import { FetchBlocked, safeFetch } from "../images/safe-fetch";

export const icsRow = async (userId: string) => (await getStore().list("integrations", userId)).find((i) => i.provider === "ics" && i.status === "connected") ?? null;

export async function fetchIcs(link: string): Promise<string> {
  try {
    const r = await safeFetch(link, { maxBytes: 3_000_000, timeoutMs: 10_000, accept: "text/calendar,text/plain,*/*" });
    if (r.status !== 200) throw new FetchBlocked("status", "That calendar link didn't open. Check it's the public or shared link.");
    const text = r.body.toString("utf8");
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new FetchBlocked("type", "That link isn't a calendar. In Apple Calendar use Share Calendar > Public Calendar and copy the link.");
    return text;
  } catch (e) { if (e instanceof FetchBlocked) throw e; throw new FetchBlocked("timeout", "I couldn't reach that calendar link."); }
}

/** Pull the next 60 days from the saved link into the calendar. Events from the link are marked source "ics" and updated in place on every sync. */
export async function syncIcs(userId: string, tz: string): Promise<{ added: number; updated: number; removed: number }> {
  const store = getStore();
  const row = await icsRow(userId);
  if (!row?.token_encrypted) return { added: 0, updated: 0, removed: 0 };
  const link = decrypt(row.token_encrypted);
  const from = new Date(), to = new Date(from.getTime() + 60 * 86_400_000);
  const items = parseIcs(await fetchIcs(link), { from, to, tz });
  const existing = (await store.list("calendar_events", userId)).filter((e) => e.source === "ics");
  const byExt = new Map(existing.map((e) => [e.external_id, e]));
  let added = 0, updated = 0, removed = 0;
  const seen = new Set<string>();
  for (const i of items) {
    seen.add(i.uid);
    const data = { title: i.summary, start_at: i.start.toISOString(), end_at: i.end.toISOString(), location: i.location, status: i.cancelled ? ("cancelled" as const) : ("confirmed" as const) };
    const cur = byExt.get(i.uid);
    if (cur) { await store.update("calendar_events", userId, cur.id, data); updated++; }
    else { await store.insert("calendar_events", userId, { ...data, kind: /showing/i.test(i.summary) ? "showing" : /open house/i.test(i.summary) ? "open_house" : "other", property_id: null, contact_id: null, source: "ics", external_id: i.uid, synced_at: new Date().toISOString(), workflow_run_id: null, notes: null } as never); added++; }
  }
  for (const e of existing) if (e.external_id && !seen.has(e.external_id) && new Date(e.start_at) > from && e.status !== "cancelled") { await store.update("calendar_events", userId, e.id, { status: "cancelled" }); removed++; } // deleted at the source
  await store.update("integrations", userId, row.id, { error: null } as never);
  return { added, updated, removed };
}

export async function saveIcsLink(userId: string, link: string) {
  const store = getStore();
  const host = new URL(link).hostname;
  const existing = (await store.list("integrations", userId)).find((i) => i.provider === "ics");
  const data = { provider: "ics" as const, status: "connected" as const, account_label: host, scopes: ["calendar.read"], token_encrypted: encrypt(link), error: null, connected_at: new Date().toISOString() };
  return existing ? store.update("integrations", userId, existing.id, data as never) : store.insert("integrations", userId, data as never);
}

export async function removeIcs(userId: string) {
  const store = getStore();
  for (const i of (await store.list("integrations", userId)).filter((x) => x.provider === "ics")) await store.remove("integrations", userId, i.id);
  for (const e of (await store.list("calendar_events", userId)).filter((x) => x.source === "ics")) await store.remove("calendar_events", userId, e.id);
}
