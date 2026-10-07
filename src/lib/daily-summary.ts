/** The morning email: what's on today, what needs a decision, and a link back into Mila. Pure builder (no I/O) so it can be tested. */
import { fmtTime } from "./time";

export interface SummaryInput {
  name: string; tz: string; appUrl: string;
  events: { title: string; start_at: string }[];
  tasks: { title: string; due_at: string | null }[];
  approvals: { title: string }[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const SITE = "https://milarealestate.app";

export function summaryHasContent(i: SummaryInput) { return i.events.length + i.tasks.length + i.approvals.length > 0; }

export function dailySummaryEmail(i: SummaryInput) {
  const first = i.name.split(" ")[0] || "there";
  const ev = i.events.slice(0, 6), tk = i.tasks.slice(0, 6), ap = i.approvals.slice(0, 5);
  const list = (rows: string[]) => rows.map((r) => `<tr><td style="padding:7px 0;border-bottom:1px solid #eeebfa;font-size:15px;line-height:1.4;color:#33305a">${r}</td></tr>`).join("");
  const section = (title: string, rows: string[]) => rows.length ? `<p style="margin:22px 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#7b63e8;font-weight:700">${title}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list(rows)}</table>` : "";
  const subject = ap.length ? `${ap.length} ${ap.length === 1 ? "thing needs" : "things need"} your OK today` : ev.length ? `Your day: ${ev.length} on the calendar` : "Your Mila summary for today";
  const text = [`Good morning, ${first}.`, "", ev.length ? "On your calendar:" : "", ...ev.map((e) => `- ${fmtTime(e.start_at, i.tz)} ${e.title}`), ap.length ? "\nWaiting for your OK:" : "", ...ap.map((a) => `- ${a.title}`), tk.length ? "\nDue today:" : "", ...tk.map((t) => `- ${t.title}`), "", `Open Mila: ${i.appUrl}`, "", "Turn this off any time in Settings > Notifications."].filter((l, n, a) => l !== "" || a[n - 1] !== "").join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eeebfa;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14122b"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeebfa"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:28px;overflow:hidden">
<tr><td style="background:#a68cff;background-image:linear-gradient(160deg,#8fb4ff 0%,#a68cff 55%,#ffc9a8 100%);padding:26px 30px;font-family:Georgia,'Times New Roman',serif;font-size:38px;color:#fff;letter-spacing:-1px">Mila</td></tr>
<tr><td style="padding:28px 30px 10px"><p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15">Good morning, ${esc(first)}.</p><p style="margin:0;font-size:15px;color:#6b6890">Here's what's on for today.</p>
${section("On your calendar", ev.map((e) => `<b>${esc(fmtTime(e.start_at, i.tz))}</b> &nbsp;${esc(e.title)}`))}${section("Waiting for your OK", ap.map((a) => esc(a.title)))}${section("Due today", tk.map((t) => esc(t.title)))}
<p style="margin:26px 0;text-align:center"><a href="${esc(i.appUrl)}" style="display:inline-block;background:#14122b;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:15px 32px;border-radius:999px">Open Mila</a></p></td></tr></table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#8a87a6;margin:16px 0 0;text-align:center">You get this because the daily summary is on. Turn it off in Settings &gt; Notifications.<br>Mila · <a href="${SITE}" style="color:#8a87a6">milarealestate.app</a></p></td></tr></table></body></html>`;
  return { subject, text, html };
}
