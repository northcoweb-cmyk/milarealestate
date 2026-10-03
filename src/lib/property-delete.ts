import type { Store } from "./db/store";
import { deleteFile } from "./files";
import type { Row } from "./types";

type R = Row & Record<string, unknown>;
export interface PropertyUsage { events: number; tasks: number; drafts: number; posts: number; sheets: number; photos: number }

/** What would go with a property — shown in the confirmation so nothing is deleted by surprise. */
export async function propertyUsage(store: Store, userId: string, propertyId: string): Promise<PropertyUsage> {
  const [ev, tk, dr, po, docs, im] = await Promise.all(["calendar_events", "tasks", "email_drafts", "social_posts", "documents", "property_images"].map((t) => store.list(t as never, userId) as Promise<R[]>));
  const mine = (r: R) => r.property_id === propertyId;
  return { events: ev.filter(mine).length, tasks: tk.filter(mine).length, drafts: dr.filter(mine).length, posts: po.filter(mine).length, sheets: docs.filter((d) => mine(d) && (d.extracted as { kind?: string } | null)?.kind === "showing_sheet").length, photos: im.filter(mine).length };
}

/**
 * Deletes a property AND everything that was made for it (calendar events, tasks, reminders, email drafts, social posts,
 * showing sheets, photos, saved lookups), so Mila stops suggesting things for a home that's gone.
 */
export async function deleteProperty(store: Store, userId: string, propertyId: string): Promise<number> {
  let n = 0;
  const rm = async (table: string, pred: (r: R) => boolean) => { n += await store.removeWhere(table as never, userId, pred as never); };
  const events = ((await store.list("calendar_events", userId)) as unknown as R[]).filter((e) => e.property_id === propertyId);
  const eventIds = new Set(events.map((e) => e.id));
  const runs = ((await store.list("workflow_runs", userId)) as unknown as R[]).filter((r) => (r.outputs as { property_id?: string } | null)?.property_id === propertyId);
  const runIds = new Set(runs.map((r) => r.id));
  // stored files (photos, videos, sheet media) first
  for (const d of (await store.list("documents", userId)) as unknown as (R & { storage_path: string })[]) if (d.property_id === propertyId && d.storage_path) await deleteFile(d.storage_path).catch(() => undefined);
  await rm("approvals", (r) => runIds.has(String(r.workflow_run_id)) || ((r.payload as { args?: Record<string, unknown> } | null)?.args?.propertyId === propertyId));
  await rm("reminders", (r) => eventIds.has(String(r.event_id)) || runIds.has(String(r.workflow_run_id)));
  await rm("tasks", (r) => r.property_id === propertyId || runIds.has(String(r.workflow_run_id)));
  await rm("email_drafts", (r) => r.property_id === propertyId || eventIds.has(String(r.event_id)));
  await rm("social_posts", (r) => r.property_id === propertyId || eventIds.has(String(r.event_id)));
  await rm("calendar_events", (r) => r.property_id === propertyId);
  await rm("workflow_runs", (r) => runIds.has(r.id));
  await rm("property_images", (r) => r.property_id === propertyId);
  await rm("documents", (r) => r.property_id === propertyId);
  await rm("memories", (r) => r.subject_id === propertyId);
  await rm("properties", (r) => r.id === propertyId);
  return n;
}
