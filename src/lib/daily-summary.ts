/**
 * The two Mila emails of the day: one in the morning (what's on today) and one in the evening (what's still open, and tomorrow).
 * Reminders are listed here instead of being emailed one by one. Pure builder (no I/O) so it can be tested.
 */
import { fmtTime } from "./time";
import { firstNameOf } from "./names";

export interface SummaryInput {
  name: string; tz: string; appUrl: string;
  mode?: "morning" | "evening";
  events: { title: string; start_at: string }[];
  tasks: { title: string; due_at: string | null }[];
  approvals: { title: string }[];
  reminders?: { title: string; remind_at: string }[];
  /** evening only: what is on tomorrow */
  tomorrow?: { events: { title: string; start_at: string }[]; reminders: { title: string; remind_at: string }[] };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const SITE = "https://milarealestate.app";

export function summaryHasContent(i: SummaryInput) {
  return i.events.length + i.tasks.length + i.approvals.length + (i.reminders?.length ?? 0) + (i.tomorrow ? i.tomorrow.events.length + i.tomorrow.reminders.length : 0) > 0;
}

export function dailySummaryEmail(i: SummaryInput) {
  const evening = i.mode === "evening";
  const first = firstNameOf(i.name) || "there";
  const ev = i.events.slice(0, 8), tk = i.tasks.slice(0, 8), ap = i.approvals.slice(0, 6), rm = (i.reminders ?? []).slice(0, 8);
  const tev = (i.tomorrow?.events ?? []).slice(0, 6), trm = (i.tomorrow?.reminders ?? []).slice(0, 6);
  const row = (when: string, what: string) => `<tr><td style="padding:11px 0;border-bottom:1px solid #eeebfa;font-size:15px;line-height:1.4;color:#33305a"><span style="display:inline-block;min-width:74px;font-weight:700;color:#14122b">${when}</span>${what}</td></tr>`;
  const plain = (what: string) => `<tr><td style="padding:11px 0;border-bottom:1px solid #eeebfa;font-size:15px;line-height:1.4;color:#33305a">${what}</td></tr>`;
  const section = (title: string, rows: string[], tone = "#7b63e8") => rows.length ? `<p style="margin:26px 0 2px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${tone};font-weight:700">${title}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>` : "";
  const chip = (n: number, label: string, bg: string) => `<td align="center" style="padding:0 4px"><div style="background:${bg};border-radius:16px;padding:12px 6px"><div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1;color:#14122b">${n}</div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b6890;margin-top:4px">${label}</div></div></td>`;
  const subject = evening
    ? (tev.length || trm.length ? `Tomorrow: ${tev.length + trm.length} on deck` : tk.length || ap.length ? `${tk.length + ap.length} still open from today` : "Your Mila evening wrap-up")
    : ap.length ? `${ap.length} ${ap.length === 1 ? "thing needs" : "things need"} your OK today` : ev.length + rm.length ? `Your day: ${ev.length + rm.length} on the list` : "Your Mila summary for today";
  const hello = evening ? `Good evening, ${first}.` : `Good morning, ${first}.`;
  const sub = evening ? "Here's what's still open and what's coming tomorrow." : "Here's what's on for today. One email, everything in it.";
  const todayRows = ev.map((e) => row(esc(fmtTime(e.start_at, i.tz)), esc(e.title)));
  const remRows = rm.map((r) => row(esc(fmtTime(r.remind_at, i.tz)), esc(r.title)));
  const text = [hello, "", sub,
    ev.length ? `\n${evening ? "Today" : "On your calendar"}:` : "", ...ev.map((e) => `- ${fmtTime(e.start_at, i.tz)} ${e.title}`),
    rm.length ? "\nReminders:" : "", ...rm.map((r) => `- ${fmtTime(r.remind_at, i.tz)} ${r.title}`),
    ap.length ? "\nWaiting for your OK:" : "", ...ap.map((a) => `- ${a.title}`),
    tk.length ? `\n${evening ? "Still open" : "Due today"}:` : "", ...tk.map((t) => `- ${t.title}`),
    tev.length ? "\nTomorrow on your calendar:" : "", ...tev.map((e) => `- ${fmtTime(e.start_at, i.tz)} ${e.title}`),
    trm.length ? "\nTomorrow's reminders:" : "", ...trm.map((r) => `- ${fmtTime(r.remind_at, i.tz)} ${r.title}`),
    "", `Open Mila: ${i.appUrl}`, "", "You get this because the daily summary is on. Turn it off in Settings > Notifications."].filter((l, idx, a) => !(l === "" && a[idx - 1] === "")).join("\n");
  const stats = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>${chip(ev.length, evening ? "Today" : "Events", "#eef3ff")}${chip(rm.length + trm.length, "Reminders", "#f3eeff")}${chip(ap.length, "Need OK", "#fff1e8")}${chip(tk.length, evening ? "Open" : "Due", "#e9f8f1")}</tr></table>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eeebfa;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14122b"><span style="display:none;max-height:0;overflow:hidden">${esc(subject)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeebfa"><tr><td align="center" style="padding:26px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:28px;overflow:hidden">
<tr><td style="background:#a68cff;background-image:linear-gradient(160deg,#8fb4ff 0%,#a68cff 55%,#ffc9a8 100%);padding:26px 30px"><span style="font-family:Georgia,'Times New Roman',serif;font-size:38px;color:#fff;letter-spacing:-1px">Mila</span><span style="float:right;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#fff;opacity:.9;padding-top:16px">${evening ? "Evening wrap-up" : "Morning plan"}</span></td></tr>
<tr><td style="padding:28px 30px 12px"><p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15">${esc(hello)}</p><p style="margin:0;font-size:15px;color:#6b6890">${esc(sub)}</p>${stats}
${section(evening ? "Today" : "On your calendar", todayRows)}${section("Reminders", remRows)}${section("Waiting for your OK", ap.map((a) => plain(esc(a.title))), "#e0743a")}${section(evening ? "Still open" : "Due today", tk.map((t) => plain(esc(t.title))))}${section("Tomorrow on your calendar", tev.map((e) => row(esc(fmtTime(e.start_at, i.tz)), esc(e.title))))}${section("Tomorrow's reminders", trm.map((r) => row(esc(fmtTime(r.remind_at, i.tz)), esc(r.title))))}
<p style="margin:28px 0;text-align:center"><a href="${esc(i.appUrl)}" style="display:inline-block;background:#14122b;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:15px 32px;border-radius:999px">Open Mila</a></p></td></tr></table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#8a87a6;margin:16px 0 0;text-align:center">You get this because the daily summary is on. Turn it off in Settings &gt; Notifications.<br>This is an automated email, so please don't reply. Mila · <a href="${SITE}" style="color:#8a87a6">milarealestate.app</a></p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}
