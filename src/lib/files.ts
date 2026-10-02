import { supabaseUrl } from "./supabase-url";
import fs from "node:fs";
import path from "node:path";
import { supabaseConfigured } from "./db/store";

/**
 * File storage boundary: local disk in dev, Supabase Storage (bucket
 * "mila-files", private) when Supabase is configured. Access is always
 * mediated by /api/files/[id], which checks the owning user.
 */
const BUCKET = "mila-files";
const dir = () => process.env.MILA_DATA_DIR || path.join(process.cwd(), ".data");
const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");

export async function putFile(userId: string, id: string, data: Buffer, mime: string): Promise<string> {
  const rel = `${safe(userId)}/${safe(id)}`;
  if (supabaseConfigured()) {
    const r = await fetch(`${supabaseUrl()}/storage/v1/object/${BUCKET}/${rel}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": mime, "x-upsert": "true" },
      body: new Uint8Array(data),
    });
    if (!r.ok) throw new Error(`File storage failed (${r.status}). Make sure the "${BUCKET}" bucket exists.`);
    return rel;
  }
  const full = path.join(dir(), "files", rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  return rel;
}

export async function getFile(storagePath: string): Promise<Buffer | null> {
  if (supabaseConfigured()) {
    const r = await fetch(`${supabaseUrl()}/storage/v1/object/${BUCKET}/${storagePath}`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  }
  const full = path.join(dir(), "files", storagePath);
  if (!full.startsWith(path.join(dir(), "files"))) return null;
  try { return fs.readFileSync(full); } catch { return null; }
}

export async function deleteFile(storagePath: string) {
  if (supabaseConfigured()) {
    await fetch(`${supabaseUrl()}/storage/v1/object/${BUCKET}/${storagePath}`, { method: "DELETE", headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
    return;
  }
  try { fs.unlinkSync(path.join(dir(), "files", storagePath)); } catch { /* already gone */ }
}

/** Direct-to-storage upload link (Supabase): lets phones upload big videos without passing through the 4.5 MB serverless body limit. */
export async function signedUpload(userId: string, id: string): Promise<{ rel: string; url: string } | null> {
  if (!supabaseConfigured()) return null;
  const rel = `${safe(userId)}/${safe(id)}`;
  const r = await fetch(`${supabaseUrl()}/storage/v1/object/upload/sign/${BUCKET}/${rel}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json", "x-upsert": "true" }, body: "{}" });
  if (!r.ok) throw new Error(`File storage failed (${r.status}). Make sure the "${BUCKET}" bucket exists.`);
  const j = (await r.json()) as { url?: string };
  if (!j.url) throw new Error("File storage didn't return an upload link.");
  return { rel, url: `${supabaseUrl()}/storage/v1${j.url}` };
}
/** Short-lived link for streaming a big file (video) straight from storage, with range requests handled by storage. */
export async function signedRead(storagePath: string, seconds = 600): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const r = await fetch(`${supabaseUrl()}/storage/v1/object/sign/${BUCKET}/${storagePath}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: seconds }) });
  if (!r.ok) return null;
  const j = (await r.json()) as { signedURL?: string };
  return j.signedURL ? `${supabaseUrl()}/storage/v1${j.signedURL}` : null;
}
export const MEDIA_IMAGE = /^image\/(png|jpe?g|webp|heic|heif)$/i;
export const MEDIA_VIDEO = /^video\/(mp4|quicktime|webm|x-m4v|3gpp|3gpp2|mpeg)$/i;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const safeName = safe;

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|heic|gif)|application\/pdf|text\/(plain|csv|tab-separated-values|markdown)|application\/(vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.ms-excel|json)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
