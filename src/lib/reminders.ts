import type { Reminder } from "./types";
import { getStore } from "./db/store";
import { sendEmailNotification } from "./notify";
import { reminderEmail } from "./email-template";
import { fmtDay, fmtTime } from "./time";
import { firstNameOf } from "./names";

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
      const tz = p.timezone || "America/New_York";
      const when = fmtTime(r.remind_at, tz);
      const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.milarealestate.app").replace(/\/$/, "");
      const ev = r.event_id ? await store.get("calendar_events", r.user_id, r.event_id).catch(() => null) : null;
      const cid = r.contact_id ?? ev?.contact_id ?? null;
      const person = cid ? await store.get("contacts", r.user_id, cid).catch(() => null) : null;
      const dayStart = new Date(new Date(r.remind_at).getTime()), dayEnd = new Date(dayStart.getTime() + 18 * 3_600_000);
      const later = (await store.list("calendar_events", r.user_id).catch(() => [])).filter((e) => e.status === "confirmed" && e.id !== ev?.id && new Date(e.start_at) > dayStart && new Date(e.start_at) < dayEnd && fmtDay(e.start_at, tz) === fmtDay(r.remind_at, tz)).sort((a, b) => a.start_at.localeCompare(b.start_at)).map((e) => ({ time: fmtTime(e.start_at, tz), title: e.title.split(" — ")[0] }));
      const m = reminderEmail({ title: r.title, whenTime: when, whenDay: fmtDay(r.remind_at, tz), firstName: firstNameOf(p.full_name || "") || "there", appUrl: base, event: ev ? { title: ev.title, when: `${fmtDay(ev.start_at, tz)} ${fmtTime(ev.start_at, tz)}`, where: ev.location ?? null } : null, person: person ? { name: person.name, phone: person.phone } : null, later });
      emailed = await sendEmailNotification(p.email, m.subject, m.text, m.html).catch(() => false);
      if (emailed) await store.insert("notifications", r.user_id, { channel: "email", title: r.title, body: "Reminder email", status: "sent", related_task_id: null });
    }
  }
  return { emailed };
}
