import { api, bad, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

/** Saves the order the person dragged their to-do list into. Only their own open tasks count. */
export const PATCH = api(async ({ profile, req }) => {
  const b = await readJson<{ ids?: unknown }>(req);
  if (!Array.isArray(b.ids) || b.ids.length > 300) throw bad("Send the task order as a list.");
  const store = getStore();
  const mine = new Set((await store.list("tasks", profile.id)).filter((t) => t.status === "open").map((t) => t.id));
  const ids = b.ids.map(String).filter((id) => mine.has(id));
  await store.update("profiles", profile.id, profile.id, { settings: { ...profile.settings, task_order: ids } } as never);
  return { ok: true };
});
