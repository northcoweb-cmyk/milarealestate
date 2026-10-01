import { api, notFound } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { getFile } from "@/lib/files";

export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const doc = await getStore().get("documents", profile.id, params.id);
  if (!doc) throw notFound("That file");
  const data = await getFile(doc.storage_path);
  if (!data) throw notFound("That file");
  const inline = doc.mime.startsWith("image/") || doc.mime === "application/pdf";
  return new Response(new Uint8Array(data), { headers: { "content-type": doc.mime, "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(doc.name)}"`, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
});
