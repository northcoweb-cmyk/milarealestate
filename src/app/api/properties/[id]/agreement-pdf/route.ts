import { api, notFound } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { makePdf, type PdfLine } from "@/lib/pdf-lite";
import { WORKSHEET_KEY, WORKSHEET_FIELDS } from "@/lib/agent/handlers/worksheet";

/** The listing-agreement worksheet the agent filled in with Mila, as a plain PDF to review with the seller. It is a worksheet, not the legal contract. */
export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const store = getStore();
  const p = await store.get("properties", profile.id, params.id);
  if (!p) throw notFound("That property");
  const raw = (await store.list("memories", profile.id)).find((m) => m.scope === "property" && m.subject_id === p.id && m.key === WORKSHEET_KEY)?.value;
  let a: Record<string, string> = {};
  try { a = raw ? JSON.parse(raw) : {}; } catch { /* empty */ }
  const lines: PdfLine[] = [
    { text: "Listing Agreement Worksheet", size: 20, bold: true },
    { text: `${p.address}${p.city ? `, ${p.city}` : ""}${p.state ? `, ${p.state}` : ""}${p.zip ? ` ${p.zip}` : ""}`, size: 13, gap: 6 },
    { text: `Prepared by ${profile.full_name}${profile.brokerage ? `, ${profile.brokerage}` : ""}`, size: 10, gap: 2 },
    ...WORKSHEET_FIELDS.flatMap((f): PdfLine[] => [{ text: f.label, size: 10, bold: true, gap: 12 }, { text: a[f.key]?.trim() || "________________________________", size: 12 }]),
    { text: "This worksheet collects the terms to discuss. It is not a contract. Use your brokerage's approved listing agreement for signatures.", size: 9, gap: 28 },
  ];
  return new Response(new Uint8Array(makePdf(lines)), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="listing-worksheet.pdf"` } });
});
