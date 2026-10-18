import { api, bad, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

// Change or remove one reminder from the Calendar screen. The agent's own edit, so it applies right away.
export const PATCH = api<{ id: string }>(async ({ profile, req, params }) => {
  const id = params.id;
  const cur = await getStore().get("reminders", profile.id, id);
  if (!cur || cur.status === "cancelled") throw bad("I couldn't find that reminder.");
  const b = await readJson(req);
  const patch: Record<string, unknown> = {};
  if (typeof b.title === "string") { if (!b.title.trim() || b.title.length > 200) throw bad("Give the reminder a short title."); patch.title = b.title.trim(); }
  if (b.remind_at) { const d = new Date(b.remind_at); if (Number.isNaN(d.getTime())) throw bad("That time isn't valid."); patch.remind_at = d.toISOString(); patch.status = "pending"; patch.delivered_at = null; }
  if (!Object.keys(patch).length) throw bad("Nothing to change.");
  const row = await getStore().update("reminders", profile.id, id, patch as never);
  return { ok: true, reminder: row };
});

export const DELETE = api<{ id: string }>(async ({ profile, url, params }) => {
  if (url.searchParams.get("confirm") !== "1") throw bad("Removing needs confirmation.");
  const id = params.id;
  const cur = await getStore().get("reminders", profile.id, id);
  if (!cur) throw bad("I couldn't find that reminder.");
  await getStore().update("reminders", profile.id, id, { status: "cancelled" } as never);
  return { ok: true };
});
