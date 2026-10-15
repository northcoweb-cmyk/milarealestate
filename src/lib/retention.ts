import { getStore } from "./db/store";

const DAY = 86_400_000;
/** What is kept and for how long. Contacts, properties, calendar, tasks and notes are kept until the person deletes them; message traffic is short-lived to keep storage small. */
export const RETENTION = { chatMessagesDays: 30, sentMessagesDays: 30, notificationsDays: 30, errorLogsDays: 30, usageDays: 120 };

/** Daily clean-up, run from the reminders cron. Safe to run twice. Never touches contacts, properties, calendar events, tasks, memories, documents or open drafts. */
export async function purgeOld(now = Date.now()): Promise<Record<string, number>> {
  const store = getStore();
  const before = (days: number) => new Date(now - days * DAY).toISOString();
  const gone: Record<string, number> = {};
  const sweep = async (table: "messages" | "emails" | "notifications" | "error_logs" | "usage" | "api_usage", days: number, extra?: (r: any) => boolean) => {
    const cut = before(days); let n = 0;
    for (const r of (await store.listAll(table as never)) as any[]) {
      const at = r.created_at as string | undefined;
      if (at && at < cut && (!extra || extra(r))) { try { await store.remove(table as never, r.user_id, r.id); n++; } catch { /* a row something else still points at stays */ } }
    }
    gone[table] = n;
  };
  await sweep("messages", RETENTION.chatMessagesDays);
  await sweep("emails", RETENTION.sentMessagesDays);
  await sweep("notifications", RETENTION.notificationsDays);
  await sweep("error_logs", RETENTION.errorLogsDays);
  await sweep("usage", RETENTION.usageDays);
  await sweep("api_usage", RETENTION.usageDays);
  // finished email drafts and old text drafts; a draft still waiting on the person is never removed
  const cut = before(RETENTION.sentMessagesDays); let d = 0;
  for (const r of await store.listAll("email_drafts")) if (r.created_at < cut && ["sent", "failed", "approved_unsent"].includes(r.status)) { try { await store.remove("email_drafts", r.user_id, r.id); d++; } catch { /* keep */ } }
  gone.email_drafts = d;
  let t = 0;
  for (const e of await store.listAll("contact_events")) if (e.kind === "text" && e.created_at < cut) { try { await store.remove("contact_events", e.user_id, e.id); t++; } catch { /* keep */ } }
  gone.texts = t;
  return gone;
}
