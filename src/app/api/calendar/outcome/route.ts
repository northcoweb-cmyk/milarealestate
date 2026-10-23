import { api, bad, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { setEventNotDone } from "@/lib/event-outcome";

/** Marks a past calendar item as not done ("it didn't happen"), or as done again. */
export const POST = api(async ({ profile, req }) => {
  const b = await readJson(req);
  const id = typeof b.id === "string" ? b.id : "";
  if (!id) throw bad("Which event?");
  const ev = await getStore().get("calendar_events", profile.id, id);
  if (!ev) throw bad("That event isn't on your calendar.");
  await setEventNotDone(getStore(), profile.id, id, b.done === false);
  return { ok: true, id, done: b.done !== false };
});
