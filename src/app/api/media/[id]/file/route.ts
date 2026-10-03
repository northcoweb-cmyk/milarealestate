import { api, bad, notFound } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, putFile } from "@/lib/files";

// Fallback upload through the app (local development, or a small file when direct upload isn't available).
export const PUT = api<{ id: string }>(async ({ profile, params, req }) => {
  const doc = await getStore().get("documents", profile.id, params.id);
  if (!doc || !(doc.extracted as { media?: boolean } | null)?.media) throw notFound("That file");
  const cap = doc.mime.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (Number(req.headers.get("content-length") ?? 0) > cap) throw bad("That file is too large.");
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) throw bad("Empty file.");
  if (buf.length > (doc.mime.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) throw bad("That file is too large.");
  await putFile(profile.id, doc.id, buf, doc.mime);
  await getStore().update("documents", profile.id, doc.id, { size_bytes: buf.length } as never);
  return { ok: true };
});
