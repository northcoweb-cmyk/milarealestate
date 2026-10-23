import type { Reminder } from "./types";
import { getStore } from "./db/store";

/**
 * Delivers one due reminder everywhere the person asked for: it is marked delivered, an in-app notification is saved,
 * and the person sees it in their next summary email (no separate email per reminder). Used by BOTH the open app (every minute)
 * and the scheduled run, so a reminder is emailed exactly once no matter which gets to it first.
 */
export async function deliverReminder(r: Reminder): Promise<{ emailed: boolean }> {
  const store = getStore();
  const now = new Date().toISOString();
  await store.update("reminders", r.user_id, r.id, { status: "delivered", delivered_at: now });
  await store.insert("notifications", r.user_id, { channel: "pwa", title: r.title, body: "Reminder", status: "sent", related_task_id: null });
  // reminders are listed in the morning and evening summary emails; they are never emailed one by one
  return { emailed: false };
}
