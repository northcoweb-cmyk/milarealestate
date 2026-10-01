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

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|heic|gif)|application\/pdf|text\/(plain|csv|tab-separated-values|markdown)|application\/(vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.ms-excel|json)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
