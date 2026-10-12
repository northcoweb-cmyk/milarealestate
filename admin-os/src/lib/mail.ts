/** Sends one email through Resend (server only). Needs RESEND_API_KEY in this project's Vercel env. */
export const SUPPORT_EMAIL = () => process.env.SUPPORT_EMAIL || "hello@milarealestate.app";

/** A sender must look like `me@x.com` or `Name <me@x.com>`. Stray quotes or a missing <> are repaired; anything unusable falls back to the default. */
export function cleanFrom(v?: string): string | null {
  const t = (v ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(t)?.[0];
  if (!email) return null;
  const name = t.replace(/<[^>]*>/g, "").replace(email, "").replace(/["'<>]/g, "").trim();
  return name ? `${name} <${email}>` : email;
}

export async function sendMail(to: string, subject: string, text: string, html?: string, replyTo?: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY isn't set in the Mila OS project." };
  const from = cleanFrom(process.env.SUPPORT_FROM || process.env.MAIL_FROM) ?? `Mila Support <${SUPPORT_EMAIL()}>`;
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ from, reply_to: replyTo || process.env.INBOUND_REPLY_TO || SUPPORT_EMAIL(), to, subject, text, html }) });
    if (!r.ok) { const j = (await r.json().catch(() => ({}))) as { message?: string; name?: string }; return { ok: false, error: `Email service said ${r.status}${j.message ? `: ${j.message}` : ""}` }; }
    return { ok: true };
  } catch { return { ok: false, error: "Couldn't reach the email service." }; }
}
