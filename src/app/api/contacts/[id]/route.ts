import { api, bad, notFound, readJson } from "@/lib/server/route";
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
