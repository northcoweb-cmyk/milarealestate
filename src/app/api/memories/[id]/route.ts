import { cleanText } from "@/lib/server/sanitize";
import { api, bad, notFound, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson(req);
  const patch: Record<string, unknown> = { source: "user_stated", confidence: 1 };
  if (typeof b.value === "string") patch.value = cleanText(b.value, 1000, true);
  if (typeof b.key === "string") { patch.key = cleanText(b.key, 80); if (String(patch.key).toLowerCase().startsWith("cache:")) throw bad("That title is reserved."); }
  if (typeof b.pinned === "boolean") patch.pinned = b.pinned;
  const cur = await getStore().get("memories", profile.id, params.id);
  if (!cur || cur.key.startsWith("cache:")) throw notFound("That memory");
  const m = await getStore().update("memories", profile.id, params.id, patch);
  if (!m) throw notFound("That memory");
  return { memory: m };
});

export const DELETE = api<{ id: string }>(async ({ profile, params }) => {
  if (!(await getStore().remove("memories", profile.id, params.id))) throw notFound("That memory");
  return { ok: true };
});
