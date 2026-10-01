import { api, bad, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { type Candidate, importCandidates, parseDelimited, rowsToCandidates, textToCandidates } from "@/lib/agent/ingest";
import { getGoogle, googleContacts, sheetRows, GoogleError } from "@/lib/integrations/google";

// Import from pasted text, a stored document, Google Contacts or a Google Sheet.
export const POST = api(async ({ profile, req }) => {
  const b = await readJson<{ source: "text" | "csv" | "google_contacts" | "google_sheet" | "document" | "manual"; text?: string; url?: string; documentId?: string; force?: Candidate[] }>(req);
  const ctx = await buildCtx(profile);
  if (b.force?.length) {
    const r = await importCandidates(ctx, b.force, { source: "Import", forceAdd: true });
    return { created: r.created.length, updated: r.updated.length, needsClarification: [], skipped: r.skipped };
  }
  let cands: Candidate[] = [];
  try {
    if (b.source === "text") cands = textToCandidates(b.text ?? "");
    else if (b.source === "csv") cands = rowsToCandidates(parseDelimited(b.text ?? ""));
    else if (b.source === "google_contacts") {
      const g = await getGoogle(profile.id);
      if (!g) return Response.json({ error: "Google isn't connected yet.", code: "not_connected" }, { status: 409 });
      cands = (await googleContacts(profile.id)).map((c) => ({ name: c.name ?? null, email: c.email ?? null, phone: c.phone ?? null, notes: null, timeline: null, location: c.location ?? null, type: null, issues: [] }));
    } else if (b.source === "google_sheet") {
      if (!(await getGoogle(profile.id))) return Response.json({ error: "Google isn't connected yet.", code: "not_connected" }, { status: 409 });
      cands = rowsToCandidates(await sheetRows(profile.id, b.url ?? ""));
    } else if (b.source === "document") {
      const { candidatesFromDocument } = await import("@/lib/agent/ingest");
      const doc = await ctx.store.get("documents", profile.id, b.documentId ?? "");
      if (!doc) throw bad("I couldn't find that file.");
      const r = await candidatesFromDocument(ctx, doc);
      if ("error" in r) throw bad(r.error);
      cands = r.candidates;
    } else throw bad("Unknown import source.");
  } catch (e) {
    if (e instanceof GoogleError) return Response.json({ error: e.message, code: e.code }, { status: 409 });
    throw e;
  }
  if (!cands.length) throw bad("I couldn't find any people in that.");
  const res = await importCandidates(ctx, cands, { source: "Import" });
  return { created: res.created.length, updated: res.updated.length, needsClarification: res.needsClarification, skipped: res.skipped };
});
