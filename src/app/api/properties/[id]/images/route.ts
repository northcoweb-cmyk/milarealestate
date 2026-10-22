import { api, bad, notFound, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

export const DELETE = api<{ id: string }>(async ({ profile, params, url }) => {
  const imageId = url.searchParams.get("imageId");
  const store = getStore();
  const img = (await store.list("property_images", profile.id)).find((i) => i.id === imageId && i.property_id === params.id);
  if (!img) throw notFound("That photo");
  await store.remove("property_images", profile.id, img.id);
  return { ok: true };
});

/** Attach a photo that was already uploaded (direct, shrunk on the phone) to this home, after the upload succeeded. */
export const POST = api<{ id: string }>(async ({ profile, params, req }) => {
  const { documentId } = await readJson<{ documentId?: string }>(req);
  const store = getStore();
  if (!(await store.get("properties", profile.id, params.id))) throw notFound("That property");
  const doc = documentId ? await store.get("documents", profile.id, documentId) : null;
  if (!doc || doc.kind !== "image") throw bad("That photo wasn't found. Try uploading it again.");
  const mine = (await store.list("property_images", profile.id)).filter((i) => i.property_id === params.id);
  if (mine.some((i) => i.document_id === doc.id)) return { ok: true };
  const img = await store.insert("property_images", profile.id, { property_id: params.id, document_id: doc.id, url: `/api/files/${doc.id}`, caption: null, position: mine.length, source: "upload" });
  return { ok: true, image: img };
});
