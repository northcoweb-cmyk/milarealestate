import { api, bad, notFound, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { TOOLS } from "@/lib/agent/tools";
import { deleteFile } from "@/lib/files";
import { isSheet, mergeSheet, progress, summarize, type SheetData } from "@/lib/showing-sheet";
import { fmtDay, fmtTime } from "@/lib/time";

async function load(profileId: string, id: string, ctx: Awaited<ReturnType<typeof buildCtx>>) {
  const doc = await ctx.store.get("documents", profileId, id);
  if (!doc || !isSheet(doc.extracted)) throw notFound("That showing sheet");
  return { doc, sheet: doc.extracted as unknown as SheetData };
}
const mediaIds = (s: SheetData) => [...new Set([...s.media, ...Object.values(s.items).flatMap((e) => e.media ?? [])])];

export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const ctx = await buildCtx(profile);
  const { doc, sheet } = await load(profile.id, params.id, ctx);
  const [property, contact, event, docs] = await Promise.all([
    ctx.store.get("properties", profile.id, sheet.property_id), sheet.contact_id ? ctx.store.get("contacts", profile.id, sheet.contact_id) : null,
    sheet.event_id ? ctx.store.get("calendar_events", profile.id, sheet.event_id) : null, ctx.store.list("documents", profile.id),
  ]);
  const want = new Set(mediaIds(sheet));
  const media = Object.fromEntries(docs.filter((d) => want.has(d.id)).map((d) => [d.id, { mime: d.mime, name: d.name, url: `/api/files/${d.id}` }]));
  return { id: doc.id, sheet, progress: progress(sheet), property: property ? { id: property.id, address: property.address, city: property.city, state: property.state, list_price: property.list_price, beds: property.beds, baths: property.baths, sqft: property.sqft, verified: property.verified } : null, contact: contact ? { id: contact.id, name: contact.name } : null, event: event ? { id: event.id, title: event.title, when: `${fmtDay(event.start_at, ctx.tz)} · ${fmtTime(event.start_at, ctx.tz)}` } : null, media, summary: doc.text_content };
});

export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson<{ items?: never; custom?: never; overall_note?: string; media?: string[]; status?: "complete" | "in_progress"; saveToContact?: boolean }>(req);
  const ctx = await buildCtx(profile);
  const { doc, sheet } = await load(profile.id, params.id, ctx);
  let next = mergeSheet(sheet, { items: b.items, custom: b.custom, overall_note: b.overall_note, media: b.media });
  let text_content = doc.text_content, summary = doc.summary;
  if (b.status === "complete" || b.status === "in_progress") {
    next = { ...next, status: b.status, completed_at: b.status === "complete" ? ctx.now.toISOString() : null };
  }
  if (next.status === "complete") {
    const prop = await ctx.store.get("properties", profile.id, next.property_id);
    const when = `${fmtDay(next.started_at, ctx.tz)} · ${fmtTime(next.started_at, ctx.tz)}`;
    text_content = summarize(next, prop?.address ?? "Property", when);
    const p = progress(next);
    summary = `${p.done}/${p.total} checked · ${p.issues} flagged`;
    if (b.status === "complete" && b.saveToContact && next.contact_id) {
      await ctx.store.insert("contact_notes", profile.id, { contact_id: next.contact_id, body: text_content.slice(0, 4000) });
      await TOOLS.update_contact.run(ctx, { id: next.contact_id, patch: {}, eventTitle: `Showing notes — ${prop?.address ?? ""}`, eventDetail: summary, eventKind: "note" });
    }
  }
  await ctx.store.update("documents", profile.id, doc.id, { extracted: next as never, text_content, summary } as never);
  return { sheet: next, progress: progress(next), summary: text_content };
});

export const DELETE = api<{ id: string }>(async ({ profile, params, url }) => {
  if (url.searchParams.get("confirm") !== "1") throw bad("Deleting needs confirmation.");
  const ctx = await buildCtx(profile);
  const { doc, sheet } = await load(profile.id, params.id, ctx);
  const ids = new Set(mediaIds(sheet));
  for (const d of await ctx.store.list("documents", profile.id)) if (ids.has(d.id)) { await deleteFile(d.storage_path); await ctx.store.remove("documents", profile.id, d.id); }
  await ctx.store.remove("documents", profile.id, doc.id);
  return { ok: true };
});
