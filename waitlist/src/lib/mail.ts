import nodemailer from "nodemailer";

const configured = () => !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
export const mailConfigured = configured;

export async function sendMail(to: string, subject: string, html: string, text: string) {
  if (!configured()) return false;
  const port = Number(process.env.SMTP_PORT || 465);
  const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 8000, socketTimeout: 10000 });
  await t.sendMail({ from: process.env.MAIL_FROM || `Mila <${process.env.SMTP_USER}>`, replyTo: process.env.MAIL_REPLY_TO || (process.env.SMTP_USER?.includes("@") ? process.env.SMTP_USER : undefined), to, subject, html, text });
  return true;
}

const LAUNCH = process.env.NEXT_PUBLIC_LAUNCH_AT || "2026-10-20T10:00:00-04:00";
const launchDay = () => `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date(LAUNCH))} at ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(LAUNCH))} Eastern`;

const SITE = "https://milarealestate.app";
/** Shared Mila email shell: cloud hero, serif wordmark, soft purple/blue palette. Inline styles only (email clients ignore the rest). */
function shell(body: string, footer: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#eeebfa;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14122b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeebfa"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px -20px rgba(80,50,180,.45)">
<tr><td style="background:#a68cff;background-image:linear-gradient(160deg,#8fb4ff 0%,#a68cff 55%,#ffc9a8 100%)"><img src="${SITE}/email/hero.jpg" width="560" alt="Mila — your AI operations manager for real estate" style="display:block;width:100%;height:auto;border:0"></td></tr>
<tr><td style="padding:32px 30px 8px">${body}</td></tr>
<tr><td style="padding:8px 30px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ff;border-radius:18px"><tr><td style="padding:16px 18px;font-size:13.5px;line-height:1.55;color:#4a4766"><b style="color:#14122b">What Mila does for you</b><br>Listings, posts, emails, follow-ups and open houses, drafted and organised. She always asks before anything goes out.</td></tr></table></td></tr>
</table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#8a87a6;margin:18px 0 0;text-align:center">${footer}<br>Mila · <a href="${SITE}" style="color:#8a87a6">milarealestate.app</a></p>
</td></tr></table></body></html>`;
}
const btn = (href: string, label: string) => `<p style="margin:26px 0;text-align:center"><a href="${href}" style="display:inline-block;background:#14122b;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:16px 34px;border-radius:999px">${label}</a></p>`;
const step = (n: number, t: string) => `<tr><td width="34" valign="top" style="padding:0 0 12px"><div style="width:26px;height:26px;border-radius:13px;background:#a68cff;color:#fff;font-weight:700;font-size:13px;line-height:26px;text-align:center">${n}</div></td><td valign="top" style="padding:3px 0 12px;font-size:15px;line-height:1.5;color:#33305a">${t}</td></tr>`;

export function confirmationEmail(name: string | null, queued = false) {
  const hi = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";
  const day = launchDay();
  const subject = queued ? "You're in the queue for Mila" : "You're on the Mila waitlist";
  const text = queued
    ? `${hi}\n\nYou're in the queue for Mila, your AI operations manager for real estate. We're letting people in a few at a time so everyone gets a fast, well-supported start.\n\nWhat happens next:\n- When a spot opens for you, we email you a personal link.\n- Use the same email address to create your password and set up your profile.\n- Your 7-day free trial starts then. No card needed.\n\nJust reply to this email if you have questions.\n\nMila`
    : `${hi}\n\nYou're on the list for Mila, your AI operations manager for real estate.\n\nWhat happens next:\n- On ${day}, we'll email you a personal link.\n- Use the same email address to create your password and set up your profile.\n- Your 7-day free trial starts then. No card needed.\n\nMila drafts your listings, posts, emails, follow-ups and open houses, and always asks before anything goes out.\n\nJust reply to this email if you have questions.\n\nMila`;
  const html = shell(`<p style="margin:0 0 6px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#7b63e8;font-weight:700">${queued ? "You're in the queue" : "You're on the list"}</p>
<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#14122b">${hi.replace(",", "")}, welcome in.</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#33305a">${queued ? "You're in line for Mila. We're letting people in a few at a time so everyone gets a fast, well-supported start. Here's what happens next:" : "Thanks for joining the Mila waitlist. Here's what happens next:"}</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${queued ? step(1, "When a spot opens for you, we email you a personal link. You don't need to do anything until then.") : step(1, `On <b>${day}</b> we email you a personal link.`)}${step(2, "Use that same email to create your password and set up your profile.")}${step(3, "Your <b>7-day free trial</b> starts then. No card needed.")}</table>
<p style="margin:6px 0 18px;font-size:14px;color:#6b6890">Questions? Just reply to this email.</p>`, "You're receiving this because you joined the Mila waitlist. Reply \"unsubscribe\" and we'll remove you.");
  return { subject, html, text };
}
