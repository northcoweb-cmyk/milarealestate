import { api, notFound } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

export const DELETE = api<{ id: string }>(async ({ profile, params, url }) => {
  const imageId = url.searchParams.get("imageId");
  const store = getStore();
  const img = (await store.list("property_images", profile.id)).find((i) => i.id === imageId && i.property_id === params.id);
  if (!img) throw notFound("That photo");
  await store.remove("property_images", profile.id, img.id);
  return { ok: true };
});
