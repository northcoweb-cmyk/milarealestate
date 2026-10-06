import nodemailer from "nodemailer";

const configured = () => !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
export const mailConfigured = configured;

export async function sendMail(to: string, subject: string, html: string, text: string) {
  if (!configured()) return false;
  const port = Number(process.env.SMTP_PORT || 465);
  const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 8000, socketTimeout: 10000 });
  await t.sendMail({ from: process.env.MAIL_FROM || `Mila <${process.env.SMTP_USER}>`, replyTo: process.env.SMTP_USER, to, subject, html, text });
  return true;
}

const LAUNCH = process.env.NEXT_PUBLIC_LAUNCH_AT || "2026-10-20T09:00:00-04:00";
const launchDay = () => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date(LAUNCH));

export function confirmationEmail(name: string | null) {
  const hi = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";
  const day = launchDay();
  const subject = "You're on the Mila waitlist";
  const text = `${hi}\n\nYou're on the list for Mila, your AI operations manager for real estate.\n\nWhat happens next:\n- On ${day}, we'll email you a personal link.\n- Use the same email address to create your password and set up your profile.\n- Your 7-day free trial starts then. No card needed.\n\nMila drafts your listings, posts, emails, follow-ups and open houses, and always asks before anything goes out.\n\nJust reply to this email if you have questions.\n\nMila`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f3fa;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden">
<tr><td style="background:linear-gradient(160deg,#8fb4ff 0%,#a68cff 55%,#ffc9a8 100%);padding:36px 28px;text-align:center"><div style="font-family:Georgia,'Times New Roman',serif;font-size:54px;line-height:1;color:#fff;letter-spacing:-1px">Mila</div><div style="color:#fff;font-size:14px;margin-top:8px">Your AI operations manager for real estate.</div></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 14px;font-size:17px">${hi}</p>
<p style="margin:0 0 14px;font-size:16px;line-height:1.55"><b>You're on the list.</b> Thanks for joining the Mila waitlist.</p>
<p style="margin:0 0 8px;font-size:15px;font-weight:600">What happens next</p>
<ol style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;color:#33323f"><li>On <b>${day}</b> we email you a personal link.</li><li>Use this same email address to create your password and set up your profile.</li><li>Your 7-day free trial starts then. No card needed.</li></ol>
<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#33323f">Mila drafts your listings, posts, emails, follow-ups and open houses, and always asks before anything goes out.</p>
<p style="margin:0;font-size:14px;color:#6b6980">Questions? Just reply to this email.</p>
</td></tr></table>
<p style="font-size:12px;color:#8a889c;margin:16px 0 0">You're receiving this because you joined the Mila waitlist. Reply "unsubscribe" and we'll remove you.</p>
</td></tr></table></body></html>`;
  return { subject, html, text };
}
