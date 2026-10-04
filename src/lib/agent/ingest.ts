import { getProvider, aiAvailable, estimateCost } from "../ai/provider";
import { recordUsage, creditCost } from "../credits";
import { getFile } from "../files";
import type { Contact, ContactStatus, ContactType, DocumentRow } from "../types";
import { type Ctx, pickColor } from "./context";
import { classifyNotes } from "./comms";
import { parseEmail, parsePhone, parseTimeline } from "./nlu";
import { TOOLS, findDuplicateContact, logContactEvent, normPhone } from "./tools";
import { saveMemory } from "./memory";

/**
 * Turns messy inputs (sign-in sheets, CSV/XLSX exports, pasted lists, photos,
 * PDFs) into contact candidates, then creates/updates contacts WITHOUT
 * creating garbage: ambiguous rows are returned for the agent to confirm.
 */
export interface Candidate {
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  timeline: string | null;
  location: string | null;
  type: ContactType | null;
  issues: string[];
  possibleMatch?: { id: string; name: string };
  raw?: string;
}

// ---------------------------------------------------------------- parsing

export function parseDelimited(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = first.includes("\t") ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

const ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "fullname", "contact", "visitor", "guest", "client", "customer"],
  first: ["first name", "first", "firstname", "given name"],
  last: ["last name", "last", "lastname", "surname", "family name"],
  email: ["email", "e-mail", "email address", "mail"],
  phone: ["phone", "phone number", "mobile", "cell", "telephone", "tel"],
  notes: ["notes", "note", "comments", "comment", "interest", "interested in", "looking for", "remarks", "details"],
  timeline: ["timeline", "timeframe", "when", "moving", "time frame"],
  location: ["location", "city", "area", "address", "zip", "neighborhood"],
  type: ["type", "role", "buyer/seller", "status", "client type"],
};

function headerMap(header: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const k = h.toLowerCase().replace(/[_*]/g, " ").trim();
    for (const [field, names] of Object.entries(ALIASES)) if (names.includes(k) && !(field in map)) map[field] = i;
  });
  return "name" in map || "first" in map || "email" in map ? map : null;
}

const typeFrom = (s: string): ContactType | null => {
  const t = s.toLowerCase();
  if (/seller/.test(t)) return "seller";
  if (/rent/.test(t)) return "rental";
  if (/invest/.test(t)) return "investor";
  if (/buyer/.test(t)) return "buyer";
  if (/past/.test(t)) return "past_client";
  if (/lead/.test(t)) return "lead";
  return null;
};

export function rowsToCandidates(rows: string[][]): Candidate[] {
  if (!rows.length) return [];
  const map = headerMap(rows[0]);
  const body = map ? rows.slice(1) : rows;
  const out: Candidate[] = [];
  for (const r of body) {
    const joined = r.join(" ");
    let c: Candidate;
    if (map) {
      const g = (k: string) => (k in map ? (r[map[k]] ?? "").trim() : "");
      const name = g("name") || [g("first"), g("last")].filter(Boolean).join(" ");
      const email = g("email") ? parseEmail(g("email")) ?? g("email") : parseEmail(joined);
      c = { name: name || null, email: email || null, phone: g("phone") ? parsePhone(g("phone")) ?? g("phone") : null, notes: g("notes") || null, timeline: g("timeline") || parseTimeline(g("notes")), location: g("location") || null, type: typeFrom(g("type")), issues: [], raw: joined };
    } else c = textLineToCandidate(r.join(", "));
    out.push(validate(c));
  }
  return out.filter((c) => c.name || c.email || c.phone);
}

export function textLineToCandidate(line: string): Candidate {
  const email = parseEmail(line), phone = parsePhone(line);
  let rest = line.replace(email ?? "", "").replace(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, "").replace(/[()\[\]<>]/g, " ");
  // a hyphen only separates fields when it stands alone ("Dana Lee - wants a condo"); "Mary-Kate" and "Smith-Jones" stay whole
  const parts = rest.split(/\s*[,|\t–—]+\s*|\s+-+\s+/).map((s) => s.trim()).filter(Boolean);
  const nameIdx = parts.findIndex((p) => /^\p{L}[\p{L}'’.-]+(?:\s+\p{L}[\p{L}'’.-]+){0,3}$/u.test(p) && p.split(" ").length <= 4 && !/\b(looking|interested|asked|wants|financ|just|rent|sell|buy)/i.test(p));
  const name = nameIdx >= 0 ? parts[nameIdx] : null;
  const notes = parts.filter((_, i) => i !== nameIdx).join("; ") || null;
  return validate({ name, email, phone, notes, timeline: parseTimeline(line), location: null, type: null, issues: [], raw: line });
}

export function textToCandidates(text: string): Candidate[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && /[,\t;]/.test(lines[0]) && headerMap(parseDelimited(lines[0])[0] ?? [])) return rowsToCandidates(parseDelimited(text));
  return lines.flatMap(splitCrowdedLine).map(textLineToCandidate).filter((c) => c.name || c.email || c.phone);
}

/**
 * One line holding several people ("Ann Lee ann@x.com; Bob Ray bob@y.com", "Ann Lee (ann@x.com), Bob Ray (bob@y.com)") is split into one
 * entry per email address, cutting each gap where the next person's name begins.
 */
function splitCrowdedLine(line: string): string[] {
  const emails = [...line.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)];
  if (emails.length < 2) return [line];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < emails.length - 1; i++) {
    const gapFrom = (emails[i].index ?? 0) + emails[i][0].length, gapTo = emails[i + 1].index ?? 0;
    const gap = line.slice(gapFrom, gapTo);
    // the next person's name is the trailing run of letters (no digits, no @) after the last separator in the gap
    let cut = -1;
    for (const m of gap.matchAll(/[;,)\]]\s*|\s+and\s+/gi)) { const tail = gap.slice((m.index ?? 0) + m[0].length); if (/\p{L}/u.test(tail) && !/[\d@]/.test(tail)) cut = (m.index ?? 0) + m[0].length; }
    if (cut < 0) { const nm = /((?:\p{Lu}[\p{L}'’-]+\s+){1,3})\(?$/u.exec(gap); cut = nm ? gap.length - nm[1].length - (gap.endsWith("(") ? 1 : 0) : gap.length; }
    out.push(line.slice(start, gapFrom + cut).replace(/[;,]\s*$/, ""));
    start = gapFrom + cut;
  }
  out.push(line.slice(start));
  return out.map((x) => x.replace(/^[\s;,]+|[\s;,]+$/g, "")).filter(Boolean);
}

function validate(c: Candidate): Candidate {
  if (c.name) c.name = c.name.replace(/\s+/g, " ").trim();
  if (!c.name) c.issues.push("No name");
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) { c.issues.push(`"${c.email}" doesn't look like an email`); c.email = null; }
  if (c.phone && normPhone(c.phone).length < 10) { c.issues.push(`"${c.phone}" is an incomplete phone number`); c.phone = null; }
  if (!c.email && !c.phone && c.name) c.issues.push("No email or phone");
  return c;
}

export async function readSpreadsheet(buf: Buffer): Promise<string[][]> {
  const mod: any = await import("read-excel-file/node");
  const fn = mod.default ?? mod;
  const res = await fn(buf);
  const rows: any[][] = Array.isArray(res) && res.length && res[0]?.data ? res[0].data : res;
  return rows.map((r) => r.map((c) => (c == null ? "" : String(c).trim())));
}

export async function pdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

// --------------------------------------------------------------- AI vision

const ATTENDEE_SCHEMA = {
  type: "object",
  properties: {
    attendees: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
          notes: { type: "string", description: "Anything written about their interest, financing, timeline, buyer/seller/renter status" },
          timeline: { type: "string" }, uncertain: { type: "boolean", description: "true if handwriting was hard to read" },
        },
        required: ["name"],
      },
    },
  },
  required: ["attendees"],
};

export async function extractAttendeesWithAI(ctx: Ctx, file: { mime: string; data: Buffer }): Promise<{ candidates: Candidate[] } | { error: string }> {
  if (!aiAvailable()) return { error: "I can't read photos or scanned PDFs right now. You can upload a CSV or spreadsheet, or paste the names and details into the chat." };
  const isPdf = file.mime === "application/pdf";
  try {
    const r = await getProvider().complete({
      tier: "vision", maxTokens: 3000,
      system: "You extract open-house sign-in sheet entries. Return exactly what is written. Never invent emails, phone numbers or names. If handwriting is unclear, give your best reading and set uncertain=true. Skip blank rows.",
      messages: [{ role: "user", content: "Extract every visitor on this sign-in sheet." }],
      images: isPdf ? undefined : [{ mediaType: file.mime, dataBase64: file.data.toString("base64") }],
      documents: isPdf ? [{ mediaType: "application/pdf", dataBase64: file.data.toString("base64") }] : undefined,
      jsonSchema: { name: "record_attendees", description: "Record the attendees found", schema: ATTENDEE_SCHEMA },
    });
    await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: isPdf ? "document_extraction" : "image_extraction", creditKey: isPdf ? "document_analysis" : "image_analysis", tier: "vision", provider: r.info.provider, model: r.info.model, inputUnits: r.usage.inputTokens, outputUnits: r.usage.outputTokens, estCostUsd: estimateCost(r.info, r.usage.inputTokens, r.usage.outputTokens) });
    ctx.usage.aiCalls++;
    const list = ((r.json as any)?.attendees ?? []) as any[];
    return { candidates: list.map((a) => { const c = validate({ name: a.name || null, email: a.email || null, phone: a.phone || null, notes: a.notes || null, timeline: a.timeline || parseTimeline(a.notes ?? ""), location: null, type: null, issues: [] }); if (a.uncertain) c.issues.push("Handwriting was hard to read — please double-check"); return c; }) };
  } catch (e) {
    return { error: `I couldn't read that file: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}

/** Turn an uploaded document into candidates (and a text extraction for storage). */
export async function candidatesFromDocument(ctx: Ctx, doc: DocumentRow): Promise<{ candidates: Candidate[] } | { error: string }> {
  const data = await getFile(doc.storage_path);
  if (!data) return { error: "I couldn't open that file." };
  const name = doc.name.toLowerCase();
  if (doc.kind === "csv" || name.endsWith(".csv") || name.endsWith(".tsv") || doc.mime.startsWith("text/")) {
    const text = data.toString("utf8");
    return { candidates: name.endsWith(".csv") || name.endsWith(".tsv") ? rowsToCandidates(parseDelimited(text)) : textToCandidates(text) };
  }
  if (doc.kind === "spreadsheet") {
    try { return { candidates: rowsToCandidates(await readSpreadsheet(data)) }; } catch { return { error: "I couldn't read that spreadsheet. Try exporting it as CSV." }; }
  }
  if (doc.kind === "pdf") {
    try {
      const text = await pdfText(data);
      if (text.trim().length > 40) {
        const c = textToCandidates(text);
        if (c.length) return { candidates: c };
      }
    } catch { /* scanned: fall through to vision */ }
    return extractAttendeesWithAI(ctx, { mime: "application/pdf", data });
  }
  if (doc.kind === "image") return extractAttendeesWithAI(ctx, { mime: doc.mime, data });
  return { error: "I can't read that file type yet." };
}

// ---------------------------------------------------------------- importing

const looseNameMatch = (a: string, b: string) => {
  const [af, al] = a.toLowerCase().split(/\s+/), [bf, bl] = b.toLowerCase().split(/\s+/);
  if (af !== bf) return false;
  if (!al || !bl) return true;
  return al[0] === bl[0];
};

export interface ImportResult { created: Contact[]; updated: Contact[]; needsClarification: Candidate[]; skipped: number }

export async function importCandidates(ctx: Ctx, cands: Candidate[], opts: { source: string; tag?: string; propertyAddress?: string; forceAdd?: boolean }): Promise<ImportResult> {
  const result: ImportResult = { created: [], updated: [], needsClarification: [], skipped: 0 };
  const existing = await ctx.store.list("contacts", ctx.userId);
  for (const c of cands) {
    if (!c.name && !opts.forceAdd) { result.needsClarification.push(c); continue; }
    const hardIssue = c.issues.some((i) => /No name|hard to read/.test(i));
    if (hardIssue && !opts.forceAdd) { result.needsClarification.push(c); continue; }

    const dup = await findDuplicateContact(ctx, c);
    // name-only fuzzy duplicates are ambiguous: ask instead of merging or duplicating
    if (!dup && !opts.forceAdd && !c.email && !c.phone && c.name) {
      const maybe = existing.find((x) => looseNameMatch(c.name!, x.name));
      if (maybe) { result.needsClarification.push({ ...c, possibleMatch: { id: maybe.id, name: maybe.name }, issues: [...c.issues, `Might be ${maybe.name}`] }); continue; }
    }
    if (!c.email && !c.phone && !opts.forceAdd) { result.needsClarification.push(c); continue; }

    const cls = classifyNotes(c.notes);
    const type: ContactType = c.type ?? (cls === "seller" ? "seller" : cls === "rental" ? "rental" : cls === "investor" ? "investor" : "lead");
    const status: ContactStatus = cls === "hot" ? "qualified" : cls === "nurture" ? "nurture" : "new";
    const tags = [opts.tag, cls === "financing" ? "financing" : null].filter(Boolean) as string[];

    if (dup) {
      const patch: Partial<Contact> = { tags: [...new Set([...dup.tags, ...tags])] };
      if (!dup.email && c.email) patch.email = c.email;
      if (!dup.phone && c.phone) patch.phone = c.phone;
      if (c.timeline && !dup.timeline) patch.timeline = c.timeline;
      if (c.notes) patch.notes = [dup.notes, c.notes].filter(Boolean).join("\n");
      const u = (await ctx.store.update("contacts", ctx.userId, dup.id, patch))!;
      await logContactEvent(ctx, dup.id, "import", opts.propertyAddress ? `Visited open house at ${opts.propertyAddress}` : `Updated from ${opts.source}`, c.notes);
      if (c.notes) await saveMemory(ctx, { scope: "contact", subject_id: dup.id, key: opts.propertyAddress ? `Open house note (${opts.propertyAddress})` : "Import note", value: c.notes, source: "imported", confidence: 0.8 });
      result.updated.push(u);
      continue;
    }
    const res = (await TOOLS.create_contact.run(ctx, { name: c.name ?? c.email!.split("@")[0], email: c.email, phone: c.phone, type, status, tags, notes: c.notes, timeline: c.timeline, location: c.location, source: opts.source, next_action: status === "nurture" ? "Gentle nurture follow-up" : "Follow up", next_action_at: new Date(ctx.now.getTime() + 24 * 3_600_000).toISOString() })) as any;
    if (!res.ok) { result.skipped++; continue; }
    const created = res.data.contact as Contact;
    existing.push(created);
    if (opts.propertyAddress) await logContactEvent(ctx, created.id, "import", `Visited open house at ${opts.propertyAddress}`, c.notes);
    if (c.notes) await saveMemory(ctx, { scope: "contact", subject_id: created.id, key: opts.propertyAddress ? `Open house note (${opts.propertyAddress})` : "Import note", value: c.notes, source: "imported", confidence: 0.8 });
    result.created.push(created);
  }
  const n = result.created.length + result.updated.length;
  const base = await creditCost("contact_import_base"), per = await creditCost("contact_import_per_25");
  await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: "contact_import", creditKey: "contact_import_base", creditsOverride: base + per * Math.ceil(n / 25) });
  return result;
}

export { pickColor };
