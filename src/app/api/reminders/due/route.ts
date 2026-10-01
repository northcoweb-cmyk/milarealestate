import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

// Polled by the open app: delivers due reminders as in-app/browser notifications.
export const GET = api(async ({ profile }) => {
  const store = getStore();
  const now = new Date().toISOString();
  const due = (await store.list("reminders", profile.id)).filter((r) => r.status === "pending" && r.remind_at <= now);
  for (const r of due) {
    await store.update("reminders", profile.id, r.id, { status: "delivered", delivered_at: now });
    await store.insert("notifications", profile.id, { channel: "pwa", title: r.title, body: "Reminder", status: "sent", related_task_id: null });
  }
  return { due: due.map((r) => ({ id: r.id, title: r.title, remind_at: r.remind_at })) };
});
