import { api, bad, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { emptySheet, isSheet, progress } from "@/lib/showing-sheet";

export const GET = api(async ({ profile, url }) => {
  const ctx = await buildCtx(profile);
  const [docs, props, contacts] = await Promise.all([ctx.store.list("documents", profile.id), ctx.store.list("properties", profile.id), ctx.store.list("contacts", profile.id)]);
  const only = url.searchParams.get("property");
  const sheets = docs.filter((d) => isSheet(d.extracted) && (!only || d.property_id === only)).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((d) => {
    const s = d.extracted as unknown as ReturnType<typeof emptySheet>;
    const p = props.find((x) => x.id === s.property_id);
    return { id: d.id, address: p?.address ?? "Property", property_id: s.property_id, status: s.status, started_at: s.started_at, completed_at: s.completed_at, contact: contacts.find((c) => c.id === s.contact_id)?.name ?? null, progress: progress(s) };
  });
  return { sheets };
});

// Start a showing sheet (or reopen the one already in progress for this showing).
export const POST = api(async ({ profile, req }) => {
  const b = await readJson<{ propertyId?: string; eventId?: string | null; contactId?: string | null }>(req);
  const ctx = await buildCtx(profile);
  let propertyId = b.propertyId ?? null, contactId = b.contactId ?? null;
  const ev = b.eventId ? await ctx.store.get("calendar_events", profile.id, b.eventId) : null;
  if (ev) { propertyId = propertyId ?? ev.property_id; contactId = contactId ?? ev.contact_id; }
  if (!propertyId) throw bad("Choose a property for this showing sheet.");
  const prop = await ctx.store.get("properties", profile.id, propertyId);
  if (!prop) throw bad("That property wasn't found.");
  const docs = await ctx.store.list("documents", profile.id);
  const existing = docs.find((d) => isSheet(d.extracted) && (d.extracted as unknown as { status: string }).status === "in_progress" && d.property_id === propertyId && ((b.eventId && (d.extracted as unknown as { event_id: string | null }).event_id === b.eventId) || (!b.eventId && !(d.extracted as unknown as { event_id: string | null }).event_id)));
  if (existing) return { id: existing.id, reused: true };
  const sheet = emptySheet(propertyId, ctx.now, { eventId: b.eventId, contactId });
  const doc = await ctx.store.insert("documents", profile.id, { name: `Showing sheet — ${prop.address}`, kind: "text", mime: "application/json", size_bytes: 0, storage_path: "", text_content: null, extracted: sheet as never, property_id: propertyId, contact_id: contactId, summary: null } as never);
  return { id: doc.id, reused: false };
});
