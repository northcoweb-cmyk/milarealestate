import { api, notFound } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { getFile, signedRead } from "@/lib/files";

export const GET = api<{ id: string }>(async ({ profile, params, req }) => {
  const doc = await getStore().get("documents", profile.id, params.id);
  if (!doc) throw notFound("That file");
  const isVideo = doc.mime.startsWith("video/");
  // Big videos stream straight from storage (it handles range requests, which iPhone Safari needs to play them).
  if (isVideo) { const link = await signedRead(doc.storage_path); if (link) return Response.redirect(link, 302); }
  const data = await getFile(doc.storage_path);
  if (!data) throw notFound("That file");
  const inline = doc.mime.startsWith("image/") || doc.mime.startsWith("video/") || doc.mime === "application/pdf";
  const headers: Record<string, string> = { "content-type": doc.mime, "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(doc.name)}"`, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "accept-ranges": "bytes" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && isVideo) {
    const total = data.length; const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    const end = Math.min(total - 1, range[1] && range[2] ? Number(range[2]) : total - 1);
    if (start > end || start >= total) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
    return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, "content-length": String(data.length) } });
});
