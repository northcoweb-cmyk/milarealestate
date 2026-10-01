import { api, notFound } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { deleteFile } from "@/lib/files";

export const DELETE = api<{ id: string }>(async ({ profile, params, url }) => {
  if (url.searchParams.get("confirm") !== "1") return Response.json({ error: "Deleting needs confirmation." }, { status: 400 });
  const store = getStore();
  const d = await store.get("documents", profile.id, params.id);
  if (!d) throw notFound("That document");
  await deleteFile(d.storage_path);
  await store.removeWhere("property_images", profile.id, (r) => (r as any).document_id === d.id);
  await store.remove("documents", profile.id, d.id);
  return { ok: true };
});
