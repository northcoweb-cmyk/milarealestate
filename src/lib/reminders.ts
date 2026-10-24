import type { Reminder } from "./types";
import { getStore } from "./db/store";
import { sendEmailNotification } from "./notify";
import { brandedEmail } from "./email-template";
import { fmtTime } from "./time";

/**
 * Delivers one due reminder everywhere the person asked for: it is marked delivered, an in-app notification is saved,
 * and, when email is one of its channels, one short email goes out right then. Used by BOTH the open app (every minute)
 * and the scheduled run; the status flips first, so a reminder is emailed exactly once no matter which gets to it first.
 */
export async function deliverReminder(r: Reminder): Promise<{ emailed: boolean }> {
  const store = getStore();
  const now = new Date().toISOString();
  const fresh = await store.get("reminders", r.user_id, r.id);
  if (fresh && fresh.status !== "pending") return { emailed: false }; // the other path already took it
  const claimed = await store.update("reminders", r.user_id, r.id, { status: "delivered", delivered_at: now });
  if (!claimed) return { emailed: false };
  await store.insert("notifications", r.user_id, { channel: "pwa", title: r.title, body: "Reminder", status: "sent", related_task_id: null });
  let emailed = false;
  if (r.channels?.includes("email")) {
    const p = await store.get("profiles", r.user_id, r.user_id).catch(() => null);
    const n = p?.settings?.notifications;
    if (p?.email && n?.channels?.email !== false && n?.topics?.task_reminders !== false) {
      const when = fmtTime(r.remind_at, p.timezone || "America/New_York");
      const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.milarealestate.app").replace(/\/$/, "");
      const html = brandedEmail({ preheader: r.title, heading: "Your reminder", chip: when, quote: { label: "Reminder", text: r.title }, body: "This is the reminder you asked Mila to send.", button: { label: "Open Mila", href: `${base}/` }, note: "This is an automatic message, so please don't reply. Manage reminders in Mila." });
      emailed = await sendEmailNotification(p.email, `Reminder: ${r.title}`, `Reminder (${when}): ${r.title}\n\nOpen Mila: ${base}/`, html).catch(() => false);
      if (emailed) await store.insert("notifications", r.user_id, { channel: "email", title: r.title, body: "Reminder email", status: "sent", related_task_id: null });
    }
  }
  return { emailed };
}
