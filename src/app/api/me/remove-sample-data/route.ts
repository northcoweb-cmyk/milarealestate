import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { purgeDemoData } from "@/lib/fresh-accounts";

// "Remove sample data": clears the fictional demo contacts, properties and everything attached to them.
export const POST = api(async ({ profile }) => {
  const store = getStore();
  const removed = await purgeDemoData(store, profile.id);
  if (profile.is_demo) await store.update("profiles", profile.id, profile.id, { is_demo: false } as never);
  return { ok: true, removed };
});
