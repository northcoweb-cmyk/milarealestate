/** A tiny text-only PDF writer (Helvetica, US Letter). Enough for a one-or-two page worksheet; no dependencies. */
const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => ({ "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "•": "*", "·": "-", "…": "..." } as Record<string, string>)[c] ?? "?").replace(/([\\()])/g, "\\$1");

export interface PdfLine { text: string; size?: number; bold?: boolean; gap?: number }

function wrap(text: string, size: number, width: number): string[] {
  const max = Math.floor(width / (size * 0.5));
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const w of para.split(/\s+/)) {
      if ((cur + " " + w).trim().length > max) { if (cur) out.push(cur); cur = w; } else cur = (cur + " " + w).trim();
    }
    out.push(cur);
  }
  return out;
}

export function makePdf(lines: PdfLine[]): Buffer {
  const W = 612, H = 792, M = 54;
  const pages: string[][] = [[]];
  let y = H - M;
  for (const l of lines) {
    const size = l.size ?? 11, lead = size * 1.4;
    y -= l.gap ?? 0;
    for (const t of wrap(l.text, size, W - 2 * M)) {
      if (y - lead < M) { pages.push([]); y = H - M; }
      y -= lead;
      pages[pages.length - 1].push(`BT /${l.bold ? "F2" : "F1"} ${size} Tf ${M} ${y.toFixed(1)} Td (${esc(t)}) Tj ET`);
    }
  }
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // pages, patched below
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const kids: number[] = [];
  for (const p of pages) {
    const body = p.join("\n");
    const c = add(`<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n"; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, "latin1");
}
