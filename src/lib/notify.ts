/**
 * Notification channel abstraction. PWA/in-app is built in; email uses Resend
 * when RESEND_API_KEY is set; SMS is a stub until Twilio is wired up.
 */
export const notificationChannels = {
  pwa: () => true,
  browser: () => true,
  email: () => Boolean(process.env.RESEND_API_KEY),
  sms: () => false, // coming soon
} as const;

export async function sendEmailNotification(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || process.env.EMAIL_FROM || "Mila <mila@example.com>", reply_to: process.env.MAIL_REPLY_TO || undefined, to, subject, text, html }),
  });
  return r.ok;
}
