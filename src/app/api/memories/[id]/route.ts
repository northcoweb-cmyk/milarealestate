import { api, notFound, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson(req);
  const patch: Record<string, unknown> = { source: "user_stated", confidence: 1 };
  if (typeof b.value === "string") patch.value = b.value;
  if (typeof b.key === "string") patch.key = b.key;
  if (typeof b.pinned === "boolean") patch.pinned = b.pinned;
  const m = await getStore().update("memories", profile.id, params.id, patch);
  if (!m) throw notFound("That memory");
  return { memory: m };
});

export const DELETE = api<{ id: string }>(async ({ profile, params }) => {
  if (!(await getStore().remove("memories", profile.id, params.id))) throw notFound("That memory");
  return { ok: true };
});
