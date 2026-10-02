/** Phone photo/video upload: photos are shrunk first (fast on cell data), videos go straight to storage. */
export interface UploadedMedia { id: string; url: string; mime: string; name: string }

async function shrinkPhoto(file: File, max = 1800): Promise<{ blob: Blob; mime: string }> {
  if (!/^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.type) || file.size < 400_000) return { blob: file, mime: file.type };
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.82));
    if (blob && blob.size < file.size) return { blob, mime: "image/jpeg" };
  } catch { /* some browsers can't decode HEIC: upload the original */ }
  return { blob: file, mime: file.type };
}

export async function uploadMedia(file: File, o: { propertyId?: string | null; sheetId?: string | null }, onProgress?: (pct: number) => void): Promise<UploadedMedia> {
  const isVideo = file.type.startsWith("video/");
  const { blob, mime } = isVideo ? { blob: file as Blob, mime: file.type || "video/mp4" } : await shrinkPhoto(file);
  const name = file.name || (isVideo ? "video.mp4" : "photo.jpg");
  const reg = await fetch("/api/media", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, mime, size: blob.size, propertyId: o.propertyId ?? null, sheetId: o.sheetId ?? null }) });
  const meta = await reg.json().catch(() => ({}));
  if (!reg.ok) throw new Error(meta.error ?? "Couldn't start the upload.");
  try {
    if (meta.upload?.url) {
      // direct to storage (same shape the Supabase client uses for signed uploads), with real progress
      await new Promise<void>((resolve, reject) => {
        const fd = new FormData(); fd.append("cacheControl", "3600"); fd.append("", blob, name);
        const x = new XMLHttpRequest(); x.open("PUT", meta.upload.url); x.setRequestHeader("x-upsert", "true");
        x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
        x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Upload failed (${x.status}).`)));
        x.onerror = () => reject(new Error("Upload failed — check your signal and try again."));
        x.send(fd);
      });
    } else {
      const r = await fetch(`/api/media/${meta.id}/file`, { method: "PUT", headers: { "content-type": mime }, body: blob });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Upload failed.");
      onProgress?.(100);
    }
  } catch (e) {
    await fetch(`/api/media/${meta.id}`, { method: "DELETE" }).catch(() => undefined); // don't leave an empty record behind
    throw e;
  }
  return { id: meta.id, url: meta.url, mime, name };
}
