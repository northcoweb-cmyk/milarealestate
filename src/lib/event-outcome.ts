import type { Store } from "./db/store";

/**
 * A calendar item whose time has passed counts as done: it is shown crossed off with a check. The agent can say it did NOT happen,
 * and that is remembered here (one small note per event) until they say it did.
 */
export const NOT_DONE_KEY = "Event not done";

export async function notDoneIds(store: Store, userId: string): Promise<Set<string>> {
  return new Set((await store.list("memories", userId)).filter((m) => m.key === NOT_DONE_KEY && m.subject_id).map((m) => m.subject_id as string));
}

export async function setEventNotDone(store: Store, userId: string, eventId: string, notDone: boolean): Promise<void> {
  await store.removeWhere("memories", userId, (r) => (r as { key?: string; subject_id?: string | null }).key === NOT_DONE_KEY && (r as { subject_id?: string | null }).subject_id === eventId);
  if (notDone) await store.insert("memories", userId, { scope: "business", subject_id: eventId, key: NOT_DONE_KEY, value: "1", source: "user_stated", confidence: 1, pinned: false });
}
