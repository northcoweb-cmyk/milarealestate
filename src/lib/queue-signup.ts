import { supabaseUrl } from "@/lib/supabase-url";
import { sendEmailNotification } from "@/lib/notify";

const QUEUED_MSG = "You're in the queue for Mila. We just emailed you, and we'll send your personal access link as soon as a spot opens. Nothing else to do.";
export { QUEUED_MSG };

/** When the launch group is full, a sign-up attempt is kept (waitlist row, status "queued") and the person gets an automated "you're in the queue" email. Never throws. */
export async function queueSignup(email: string, name: string | null): Promise<void> {
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY, base = (() => { try { return supabaseUrl(); } catch { return ""; } })();
  const addr = email.trim().toLowerCase();
  let isNew = true;
  if (svc && base) {
    try {
      const h = { apikey: svc, Authorization: `Bearer ${svc}`, "content-type": "application/json" };
      const found = await fetch(`${base}/rest/v1/waitlist?email=eq.${encodeURIComponent(addr)}&select=id&limit=1`, { headers: h, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (found.ok && ((await found.json()) as unknown[]).length) isNew = false; // already on the list: no second email
      else await fetch(`${base}/rest/v1/waitlist`, { method: "POST", headers: h, body: JSON.stringify({ email: addr, name: name?.slice(0, 120) || null, source: "app_signup", status: "queued" }), signal: AbortSignal.timeout(8000) });
    } catch { /* the sign-up message still tells them what happens next */ }
  }
  if (!isNew) return;
  const hi = name ? `Hi ${name.trim().split(/\s+/)[0]},` : "Hi there,";
  const text = `${hi}\n\nYou're in the queue for Mila, your AI operations manager for real estate.\n\nWe're letting people in a few at a time so everyone gets a fast, well-supported start. When a spot opens for you, we'll email your personal access link. Use this same email address to create your password.\n\nYour 7-day free trial starts then. No card needed.\n\nThis is an automated email, so please don't reply. Questions? Write to support@milarealestate.app.\n\n— The Mila team`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;color:#14122b"><p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#7b63e8;font-weight:700;margin:0 0 8px">You're in the queue</p><p style="font-size:24px;margin:0 0 16px">${hi.replace(",", "")}, you're in line for Mila.</p><p style="line-height:1.55">We're letting people in a few at a time so everyone gets a fast, well-supported start. When a spot opens for you, we'll email your personal access link. Use this same email address to create your password.</p><p style="line-height:1.55">Your 7-day free trial starts then. No card needed.</p><p style="color:#6b6890;font-size:13px">This is an automated email, so please don't reply. Questions? Write to support@milarealestate.app.</p></div>`;
  await sendEmailNotification(addr, "You're in the queue for Mila", text, html).catch(() => false);
}
