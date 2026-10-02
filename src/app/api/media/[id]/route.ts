import { api, notFound } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { deleteFile } from "@/lib/files";

export const DELETE = api<{ id: string }>(async ({ profile, params }) => {
  const store = getStore();
  const doc = await store.get("documents", profile.id, params.id);
  if (!doc || !(doc.extracted as { media?: boolean } | null)?.media) throw notFound("That file");
  await deleteFile(doc.storage_path);
  await store.remove("documents", profile.id, doc.id);
  return { ok: true };
});
