import { createHmac, timingSafeEqual } from "node:crypto";
import type { CalendarEvent } from "../types";

/** Lets Apple Calendar (and any calendar app) take Mila's events: one event as a file, or the whole calendar as a live subscription link. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545: lines over 75 bytes are folded with a leading space (counted in bytes so accents and emoji never split mid-character). */
export function fold(line: string): string {
  const out: string[] = []; let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export interface IcsItem { ev: CalendarEvent; description: string }

export function buildIcs(items: IcsItem[], opts: { name?: string; feed?: boolean } = {}): string {
  const now = utc(new Date().toISOString());
  const L: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mila//Mila Real Estate//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(opts.name ?? "Mila")}`];
  if (opts.feed) L.push("REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M");
  for (const { ev, description } of items) {
    const seq = Math.floor(new Date(ev.updated_at ?? ev.created_at ?? Date.now()).getTime() / 1000);
    L.push("BEGIN:VEVENT", `UID:${ev.id}@milarealestate.app`, `DTSTAMP:${now}`, `SEQUENCE:${seq}`, `DTSTART:${utc(ev.start_at)}`, `DTEND:${utc(ev.end_at)}`, `SUMMARY:${esc(ev.title)}`);
    if (ev.location) L.push(`LOCATION:${esc(ev.location)}`);
    if (description) L.push(`DESCRIPTION:${esc(description)}`);
    L.push(`STATUS:${ev.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`, "TRANSP:OPAQUE");
    if (ev.status !== "cancelled") L.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:Tomorrow: ${esc(ev.title)}`, "TRIGGER:-P1D", "END:VALARM", "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(ev.title)}`, "TRIGGER:-PT30M", "END:VALARM"); // a day before, and 30 minutes before
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

// ---- private subscription link: no stored secret, the link is signed to the person and can be rotated by changing SESSION_SECRET
const key = () => process.env.SESSION_SECRET || process.env.INTEGRATION_ENCRYPTION_KEY || (process.env.NODE_ENV === "production" ? "" : "dev");
const sig = (uid: string) => createHmac("sha256", key()).update(`cal-feed.${uid}`).digest("hex").slice(0, 32);
export function feedToken(uid: string): string | null { return key() ? `${uid}.${sig(uid)}` : null; }
export function feedUser(token: string): string | null {
  const t = token.replace(/\.ics$/i, ""); const i = t.lastIndexOf(".");
  if (i < 1 || !key()) return null;
  const uid = t.slice(0, i), s = t.slice(i + 1), want = sig(uid);
  return s.length === want.length && timingSafeEqual(Buffer.from(s), Buffer.from(want)) ? uid : null;
}
