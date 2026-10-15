import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { deliverReminder } from "@/lib/reminders";

// Polled by the open app: delivers due reminders as in-app/browser notifications.
export const GET = api(async ({ profile }) => {
  const store = getStore();
  const now = new Date().toISOString();
  const due = (await store.list("reminders", profile.id)).filter((r) => r.status === "pending" && r.remind_at <= now);
  for (const r of due) await deliverReminder(r); // in-app now, and the email too if it was asked for
  return { due: due.map((r) => ({ id: r.id, title: r.title, remind_at: r.remind_at })) };
});
