import { api, bad, notFound, readJson } from "@/lib/server/route";
import { cleanText } from "@/lib/server/sanitize";
import { CONTACT_STATUSES, CONTACT_TYPES } from "@/lib/types";
import { buildCtx } from "@/lib/agent/engine";
import { TOOLS } from "@/lib/agent/tools";
import { contactFacts, listMemories } from "@/lib/agent/memory";

export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const ctx = await buildCtx(profile);
  const contact = await ctx.store.get("contacts", profile.id, params.id);
  if (!contact) throw notFound("That contact");
  const [events, notes, memories, tasks, emails] = await Promise.all([
    ctx.store.list("contact_events", profile.id), ctx.store.list("contact_notes", profile.id), listMemories(ctx, { scope: "contact", subject_id: contact.id }),
    ctx.store.list("tasks", profile.id), ctx.store.list("email_drafts", profile.id),
  ]);
  return {
    contact, facts: await contactFacts(ctx, contact), memories,
    timeline: events.filter((e) => e.contact_id === contact.id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    notes: notes.filter((n) => n.contact_id === contact.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    tasks: tasks.filter((t) => t.contact_id === contact.id && t.status === "open"),
    drafts: emails.filter((d) => d.to_contact_ids.includes(contact.id) && d.status !== "sent"),
  };
});

const FIELDS = ["name", "email", "phone", "type", "status", "tags", "notes", "preferences", "location", "budget_min", "budget_max", "timeline", "importance", "next_action", "next_action_at"];

export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson(req);
  const ctx = await buildCtx(profile);
  const patch: Record<string, unknown> = {};
  for (const k of FIELDS) if (k in b) patch[k] = b[k];
  for (const k of ["name", "email", "phone", "location", "timeline", "next_action"] as const) if (k in patch && patch[k] != null) patch[k] = cleanText(patch[k], k === "email" ? 254 : 160);
  if ("name" in patch && !patch.name) throw bad("A contact needs a name.");
  if ("notes" in patch && patch.notes != null) patch.notes = cleanText(patch.notes, 4000, true);
  if ("type" in patch && !(CONTACT_TYPES as readonly string[]).includes(String(patch.type))) throw bad("Unknown contact type.");
  if ("status" in patch && !(CONTACT_STATUSES as readonly string[]).includes(String(patch.status))) throw bad("Unknown status.");
  if ("tags" in patch) patch.tags = Array.isArray(patch.tags) ? (patch.tags as unknown[]).slice(0, 20).map((t) => cleanText(t, 40)).filter(Boolean) : [];
  if ("preferences" in patch && (typeof patch.preferences !== "object" || Array.isArray(patch.preferences) || JSON.stringify(patch.preferences ?? {}).length > 4000)) throw bad("Those preferences aren't valid.");
  for (const k of ["budget_min", "budget_max", "importance"] as const) if (k in patch && patch[k] != null && !(Number.isFinite(Number(patch[k])) && Number(patch[k]) >= 0 && Number(patch[k]) <= 1e10)) throw bad("That number isn't valid.");
  if (b.addNote) {
    await ctx.store.insert("contact_notes", profile.id, { contact_id: params.id, body: String(b.addNote).slice(0, 4000) });
    await TOOLS.update_contact.run(ctx, { id: params.id, patch: {}, eventTitle: "Note added", eventDetail: String(b.addNote).slice(0, 200), eventKind: "note" });
  }
  const r = await TOOLS.update_contact.run(ctx, { id: params.id, patch, ...(b.status ? {} : {}) });
  if (!r.ok) throw notFound("That contact");
  return r.data;
});

// Deleting is high-risk: the client must pass confirm=1 after the user confirmed.
export const DELETE = api<{ id: string }>(async ({ profile, params, url }) => {
  if (url.searchParams.get("confirm") !== "1") throw bad("Deleting needs confirmation.");
  const ctx = await buildCtx(profile);
  const r = await TOOLS.delete_contact.run(ctx, { id: params.id });
  if (!r.ok) throw notFound("That contact");
  return { ok: true };
});
