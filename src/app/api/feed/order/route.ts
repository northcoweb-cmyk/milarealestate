import { api, bad, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

/** Saves the order the person dragged their "Ready for approval" cards into on Home. */
export const PATCH = api(async ({ profile, req }) => {
  const b = await readJson<{ ids?: unknown }>(req);
  if (!Array.isArray(b.ids) || b.ids.length > 50) throw bad("Send the order as a list.");
  const ids = b.ids.map((x) => String(x).slice(0, 120));
  await getStore().update("profiles", profile.id, profile.id, { settings: { ...profile.settings, home_order: ids } } as never);
  return { ok: true };
});
