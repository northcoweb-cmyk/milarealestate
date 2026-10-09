import type { Store } from "./db/store";
import type { Row } from "./types";
import { isTester } from "./testers";

/**
 * Accounts that must never show demo data. Listed here (plus anything in the MILA_NO_DEMO_EMAILS env var,
 * comma-separated). Their sample-data option is hidden and any demo rows that already exist are removed.
 */
const BUILT_IN = ["sarahpark0506@gmail.com"];
const list = () => [...BUILT_IN, ...(process.env.MILA_NO_DEMO_EMAILS ?? "").split(",")].map((e) => e.trim().toLowerCase()).filter(Boolean);
export const isNoDemo = (email: string | null | undefined) => !!email && (list().includes(email.trim().toLowerCase()) || isTester(email));

/**
 * Removes the fictional sample data (contacts with source "Demo data", properties flagged is_demo, and what hangs off them).
 * If the account holds nothing but sample data, everything the sample seeded is cleared; if real records are mixed in,
 * only rows linked to the sample contacts/properties are removed. Returns how many rows were deleted.
 */
export async function purgeDemoData(store: Store, userId: string): Promise<number> {
  const [contacts, props] = await Promise.all([store.list("contacts", userId), store.list("properties", userId)]);
  const demoC = contacts.filter((c) => c.source === "Demo data"), demoP = props.filter((p) => p.is_demo);
  if (!demoC.length && !demoP.length) return 0;
  const cIds = new Set(demoC.map((c) => c.id)), pIds = new Set(demoP.map((p) => p.id));
  const onlyDemo = contacts.length === demoC.length && props.length === demoP.length;
  let n = 0;
  const rm = async (table: Parameters<Store["removeWhere"]>[0], pred: (r: Row & Record<string, unknown>) => boolean) => { n += await store.removeWhere(table, userId, pred as never); };
  const linked = (r: Row & Record<string, unknown>) => (r.contact_id != null && cIds.has(String(r.contact_id))) || (r.property_id != null && pIds.has(String(r.property_id)));
  for (const t of ["contact_events", "contact_notes", "property_images", "calendar_events", "tasks", "approvals", "email_drafts", "social_posts", "reminders", "workflow_runs", "notifications", "memories"] as const)
    await rm(t, onlyDemo ? () => true : (r) => linked(r) || (t === "memories" && r.scope === "contact" && cIds.has(String(r.subject_id))));
  await rm("document_templates", (r) => /\(sample\)/i.test(String(r.name)));
  await rm("contacts", (r) => cIds.has(r.id));
  await rm("properties", (r) => pIds.has(r.id));
  return n;
}
