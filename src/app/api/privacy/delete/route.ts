import { api, bad, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { TABLES } from "@/lib/types";
import { clearSession } from "@/lib/auth";
import { deleteFile } from "@/lib/files";
import { disconnectGoogle } from "@/lib/integrations/google";

// Permanently deletes the user's data. Requires typing DELETE.
export const POST = api(async ({ profile, req }) => {
  const b = await readJson<{ confirm?: string }>(req);
  if (b.confirm !== "DELETE") throw bad('Type DELETE to confirm.');
  const store = getStore();
  await disconnectGoogle(profile.id);
  for (const d of await store.list("documents", profile.id)) await deleteFile(d.storage_path);
  for (const t of TABLES) await store.removeWhere(t, profile.id, () => true);
  await clearSession();
  return { ok: true };
});
