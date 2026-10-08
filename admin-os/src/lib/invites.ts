import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";

const base = () => (process.env.SUPABASE_URL ?? "").trim().replace(/\/(rest|auth|storage)(\/v1.*)?\/*$/i, "").replace(/\/+$/, "");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const H = (extra: Record<string, string> = {}) => ({ apikey: key(), Authorization: `Bearer ${key()}`, "content-type": "application/json", ...extra });

export const smtpConfigured = () => !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
export const appUrl = () => (process.env.MILA_APP_URL || "https://milarealestate.vercel.app").replace(/\/+$/, "");

export interface Entry { id: string; email: string; name: string | null; invite_token: string | null; invited_at: string | null; claimed_at: string | null }

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${base()}/rest/v1/${path}`, { ...init, headers: { ...H(), ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  return r;
}

/** How many people may be let in at once. Raise it in Vercel (SEAT_CAP) as launch goes well. Everyone else waits in the queue. */
export const seatCap = () => { const n = Number(process.env.SEAT_CAP ?? 20); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 20; };

export async function counts() {
  const r = await rest("waitlist?select=id,invite_token,invited_at,claimed_at&limit=20000");
  if (!r.ok) return null;
  const rows = (await r.json()) as { invited_at: string | null; claimed_at: string | null }[];
  return { total: rows.length, invited: rows.filter((x) => x.invited_at).length, claimed: rows.filter((x) => x.claimed_at).length, pending: rows.filter((x) => !x.invited_at).length };
}

/** Next people who have not been invited yet (oldest first). */
export async function nextBatch(n: number): Promise<Entry[]> {
  const r = await rest(`waitlist?select=id,email,name,invite_token,invited_at,claimed_at&invited_at=is.null&claimed_at=is.null&order=created_at.asc&limit=${n}`);
  if (!r.ok) throw new Error(`batch ${r.status}`);
  return (await r.json()) as Entry[];
}

async function ensureTestEntry(email: string) {
  const g = await rest(`waitlist?select=id,email,name,invite_token,invited_at,claimed_at&email=eq.${encodeURIComponent(email)}&limit=1`);
  const hit = g.ok ? ((await g.json()) as Entry[])[0] : null;
  if (hit) return hit;
  const ins = await rest("waitlist", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ email, name: null, source: "test", status: "test" }) });
  if (!ins.ok) throw new Error(`insert ${ins.status}`);
  return ((await ins.json()) as Entry[])[0];
}

export async function sendInvite(e: Entry): Promise<void> {
  const token = e.invite_token && /^[a-f0-9]{48}$/.test(e.invite_token) ? e.invite_token : randomBytes(24).toString("hex");
  if (token !== e.invite_token) {
    const p = await rest(`waitlist?id=eq.${encodeURIComponent(e.id)}`, { method: "PATCH", body: JSON.stringify({ invite_token: token }) });
    if (!p.ok) throw new Error(`token ${p.status}`);
  }
  const link = `${appUrl()}/claim?t=${token}`;
  const m = inviteEmail(e.name, link);
  const port = Number(process.env.SMTP_PORT || 465);
  const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 8000, socketTimeout: 12000 });
  await t.sendMail({ from: process.env.MAIL_FROM || `Mila <${process.env.SMTP_USER}>`, replyTo: process.env.MAIL_REPLY_TO || (process.env.SMTP_USER?.includes("@") ? process.env.SMTP_USER : undefined), to: e.email, subject: m.subject, html: m.html, text: m.text });
  const done = await rest(`waitlist?id=eq.${encodeURIComponent(e.id)}`, { method: "PATCH", body: JSON.stringify({ invited_at: new Date().toISOString(), status: "invited" }) });
  if (!done.ok) throw new Error(`mark ${done.status}`);
}

export async function sendTest(email: string) { await sendInvite(await ensureTestEntry(email)); }

const SITE = "https://milarealestate.app";
/** Shared Mila email shell: cloud hero, serif wordmark, soft purple/blue palette. Inline styles only (email clients ignore the rest). */
function shell(body: string, footer: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#eeebfa;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14122b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeebfa"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px -20px rgba(80,50,180,.45)">
<tr><td style="background:#a68cff;background-image:linear-gradient(160deg,#8fb4ff 0%,#a68cff 55%,#ffc9a8 100%)"><img src="${SITE}/email/hero.jpg" width="560" alt="Mila — your AI operations manager for real estate" style="display:block;width:100%;height:auto;border:0"></td></tr>
<tr><td style="padding:32px 30px 8px">${body}</td></tr>
<tr><td style="padding:8px 30px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ff;border-radius:18px"><tr><td style="padding:16px 18px;font-size:13.5px;line-height:1.55;color:#4a4766"><b style="color:#14122b">What Mila does for you</b><br>Listings, posts, emails, follow-ups and open houses, drafted and organized. She always asks before anything goes out.</td></tr></table></td></tr>
</table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#8a87a6;margin:18px 0 0;text-align:center">${footer}<br>Mila · <a href="${SITE}" style="color:#8a87a6">milarealestate.app</a></p>
</td></tr></table></body></html>`;
}
const btn = (href: string, label: string) => `<p style="margin:26px 0;text-align:center"><a href="${href}" style="display:inline-block;background:#14122b;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:16px 34px;border-radius:999px">${label}</a></p>`;
const step = (n: number, t: string) => `<tr><td width="34" valign="top" style="padding:0 0 12px"><div style="width:26px;height:26px;border-radius:13px;background:#a68cff;color:#fff;font-weight:700;font-size:13px;line-height:26px;text-align:center">${n}</div></td><td valign="top" style="padding:3px 0 12px;font-size:15px;line-height:1.5;color:#33305a">${t}</td></tr>`;

export function inviteEmail(name: string | null, link: string) {
  const hi = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";
  const subject = "Access granted. Your Mila spot is ready.";
  const text = `${hi}\n\nMila is live, and your spot is ready.\n\nCreate your password and set up your profile here:\n${link}\n\nUse the same email address you signed up with. Your 7-day free trial starts when you finish. No card needed.\n\nThis link is personal to you. Just reply to this email if anything goes wrong.\n\nMila`;
  const html = shell(`<p style="margin:0 0 6px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#7b63e8;font-weight:700">Access granted</p>
<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#14122b">${hi.replace(",", "")}, your spot is ready.</p>
<p style="margin:0;font-size:16px;line-height:1.55;color:#33305a">Mila is live. Create your password and set up your profile to get started.</p>
${btn(link, "Open Mila")}
<p style="margin:0 0 12px;font-size:14.5px;line-height:1.55;color:#33305a">Use the same email you joined with. Your <b>7-day free trial</b> starts when you finish setup. No card needed.</p>
<p style="margin:0 0 4px;font-size:12.5px;color:#6b6890">Button not working? Paste this into your browser:</p>
<p style="margin:0 0 16px;font-size:12px;color:#6b6890;word-break:break-all">${link}</p>`, "This link is personal to you. Reply to this email if anything goes wrong.");
  return { subject, html, text };
}

export async function entryById(id: string): Promise<Entry | null> {
  const r = await rest(`waitlist?select=id,email,name,invite_token,invited_at,claimed_at&id=eq.${encodeURIComponent(id)}&limit=1`);
  return r.ok ? (((await r.json()) as Entry[])[0] ?? null) : null;
}
