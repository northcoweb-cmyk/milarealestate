import { api, notFound } from "@/lib/server/route";
import { isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { getFile } from "@/lib/files";

/** Owner-only: open a file a person attached to a support ticket. Only files that are attached to a ticket can be read this way. */
export const GET = api<{ id: string }>(async ({ profile, params }) => {
  if (!isAdmin(profile)) return Response.json({ error: "Not allowed." }, { status: 403 });
  const store = getStore();
  const doc = (await store.listAll("documents")).find((d) => d.id === params.id);
  if (!doc) throw notFound("That file");
  const attached = (await store.listAll("feedback")).some((f) => f.category === "support_ticket" && JSON.stringify(f.context ?? {}).includes(params.id));
  if (!attached) throw notFound("That file");
  const data = await getFile(doc.storage_path);
  if (!data) throw notFound("That file");
  const inline = doc.mime.startsWith("image/") || doc.mime === "application/pdf";
  return new Response(new Uint8Array(data), { headers: { "content-type": doc.mime, "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(doc.name)}"`, "cache-control": "private, no-store" } });
});
