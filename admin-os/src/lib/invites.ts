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
  const done = await rest(`waitlist?id=eq.${encodeURIComponent(e.id)}`, { method: "PATCH", body: JSON.stringify({ invited_at: new Date().toISOString() }) });
  if (!done.ok) throw new Error(`mark ${done.status}`);
}

export async function sendTest(email: string) { await sendInvite(await ensureTestEntry(email)); }

export function inviteEmail(name: string | null, link: string) {
  const hi = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";
  const subject = "Mila is open. Your link is inside.";
  const text = `${hi}\n\nMila is live, and your spot is ready.\n\nCreate your password and set up your profile here:\n${link}\n\nUse the same email address you signed up with. Your 7-day free trial starts when you finish. No card needed.\n\nThis link is personal to you. Just reply to this email if anything goes wrong.\n\nMila`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f3fa;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden">
<tr><td style="background:linear-gradient(160deg,#8fb4ff 0%,#a68cff 55%,#ffc9a8 100%);padding:40px 28px;text-align:center"><div style="font-family:Georgia,'Times New Roman',serif;font-size:56px;line-height:1;color:#fff;letter-spacing:-1px">Mila</div><div style="color:#fff;font-size:15px;margin-top:10px">Your AI operations manager for real estate.</div></td></tr>
<tr><td style="padding:30px 28px">
<p style="margin:0 0 14px;font-size:17px">${hi}</p>
<p style="margin:0 0 20px;font-size:17px;line-height:1.5"><b>Mila is open, and your spot is ready.</b></p>
<p style="margin:0 0 24px;text-align:center"><a href="${link}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:15px 30px;border-radius:999px">Create your password</a></p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#33323f">Use the same email address you joined with. Your <b>7-day free trial</b> starts when you finish setting up. No card needed.</p>
<p style="margin:0 0 6px;font-size:13px;color:#6b6980">Button not working? Copy this link into your browser:</p>
<p style="margin:0 0 16px;font-size:12px;color:#6b6980;word-break:break-all">${link}</p>
<p style="margin:0;font-size:14px;color:#6b6980">This link is personal to you. Reply to this email if anything goes wrong.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
