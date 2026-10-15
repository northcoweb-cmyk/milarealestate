import type { Reminder } from "./types";
import { getStore } from "./db/store";
import { sendEmailNotification } from "./notify";
import { brandedEmail } from "./email-template";

/**
 * Delivers one due reminder everywhere the person asked for: it is marked delivered, an in-app notification is saved,
 * and an email goes out if email is on for both this reminder and their settings. Used by BOTH the open app (every minute)
 * and the scheduled run, so a reminder is emailed exactly once no matter which gets to it first.
 */
export async function deliverReminder(r: Reminder): Promise<{ emailed: boolean }> {
  const store = getStore();
  const now = new Date().toISOString();
  await store.update("reminders", r.user_id, r.id, { status: "delivered", delivered_at: now });
  await store.insert("notifications", r.user_id, { channel: "pwa", title: r.title, body: "Reminder", status: "sent", related_task_id: null });
  if (!r.channels.includes("email")) return { emailed: false };
  const p = await store.get("profiles", r.user_id, r.user_id);
  if (!p || p.settings.notifications.channels.email === false) return { emailed: false };
  const html = brandedEmail({ preheader: r.title, chip: "Reminder", heading: r.title, body: "This is the reminder you asked Mila to send. Open Mila to see everything for today." });
  const ok = await sendEmailNotification(p.email, `Reminder: ${r.title}`, `${r.title}\n\nThis is the reminder you asked Mila to send.`, html).catch(() => false);
  return { emailed: ok };
}
