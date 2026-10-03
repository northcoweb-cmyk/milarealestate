import { randomUUID } from "node:crypto";
import { api, bad } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, putFile } from "@/lib/files";
import { pdfText } from "@/lib/agent/ingest";
import type { DocumentRow } from "@/lib/types";

const kindOf = (name: string, mime: string): DocumentRow["kind"] => {
  const n = name.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (n.endsWith(".csv") || n.endsWith(".tsv") || mime === "text/csv") return "csv";
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || mime.includes("spreadsheet") || mime.includes("excel")) return "spreadsheet";
  if (mime.startsWith("text/") || n.endsWith(".md") || n.endsWith(".txt")) return "text";
  return "other";
};

export const POST = api(async ({ profile, req }) => {
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) throw bad("Choose a file to upload.");
  const propertyId = (form?.get("propertyId") as string) || null;
  if (propertyId && !(await getStore().get("properties", profile.id, propertyId))) throw bad("That property wasn't found.");
  const out: DocumentRow[] = [];
  for (const f of files.slice(0, 10)) {
    if (f.size > MAX_UPLOAD_BYTES) throw bad(`${f.name} is larger than 12 MB.`);
    // browsers sometimes omit the mime for .csv/.xlsx; infer from the extension
    let mime = f.type || (f.name.endsWith(".csv") ? "text/csv" : f.name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/octet-stream");
    if (!ALLOWED_MIME.test(mime)) throw bad(`${f.name}: that file type isn't supported yet.`);
    const buf = Buffer.from(await f.arrayBuffer());
    const id = randomUUID();
    const storage = await putFile(profile.id, id, buf, mime);
    const kind = kindOf(f.name, mime);
    let text: string | null = null;
    if (kind === "text") text = buf.toString("utf8").slice(0, 200_000);
    if (kind === "pdf") { try { text = (await pdfText(buf)).slice(0, 200_000) || null; } catch { text = null; } }
    const doc = await getStore().insert("documents", profile.id, { id, name: f.name, kind, mime, size_bytes: buf.length, storage_path: storage, text_content: text, extracted: null, property_id: propertyId, contact_id: null, summary: text ? text.replace(/\s+/g, " ").slice(0, 140) : null });
    if (propertyId && kind === "image") {
      const existing = (await getStore().list("property_images", profile.id)).filter((i) => i.property_id === propertyId);
      await getStore().insert("property_images", profile.id, { property_id: propertyId, document_id: id, url: `/api/files/${id}`, caption: null, position: existing.length, source: "upload" });
    }
    out.push(doc);
  }
  return { documents: out.map(({ text_content, ...d }) => d) };
});
