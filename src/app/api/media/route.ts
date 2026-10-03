import { randomUUID } from "node:crypto";
import { api, bad } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MEDIA_IMAGE, MEDIA_VIDEO, safeName, signedUpload } from "@/lib/files";

/**
 * Step 1 of a photo/video upload: create the record and (on Supabase) hand back a direct upload link,
 * so a 40 MB walkthrough video never has to pass through the app server.
 */
export const POST = api(async ({ profile, req }) => {
  const b = (await req.json().catch(() => ({}))) as { name?: string; mime?: string; size?: number; propertyId?: string | null; sheetId?: string | null };
  const mime = String(b.mime ?? ""), size = Number(b.size) || 0;
  const isImage = MEDIA_IMAGE.test(mime), isVideo = MEDIA_VIDEO.test(mime);
  if (!isImage && !isVideo) throw bad("That file type isn't supported. Use a photo (JPG, PNG, HEIC) or a video (MP4, MOV).");
  if (isImage && size > MAX_IMAGE_BYTES) throw bad("That photo is larger than 15 MB.");
  if (isVideo && size > MAX_VIDEO_BYTES) throw bad("That video is larger than 50 MB. Record a shorter clip (about a minute).");
  if (b.propertyId && !(await getStore().get("properties", profile.id, String(b.propertyId)))) throw bad("That property wasn't found.");
  const id = randomUUID();
  const rel = `${safeName(profile.id)}/${safeName(id)}`;
  const direct = await signedUpload(profile.id, id);
  const name = String(b.name || (isVideo ? "video" : "photo")).slice(0, 120);
  await getStore().insert("documents", profile.id, { id, name, kind: isVideo ? "video" : "image", mime, size_bytes: size, storage_path: rel, text_content: null, extracted: { media: true, sheet: b.sheetId ?? null }, property_id: b.propertyId || null, contact_id: null, summary: null } as never);
  return { id, url: `/api/files/${id}`, upload: direct ? { url: direct.url } : null };
});
