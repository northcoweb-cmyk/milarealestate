import { cleanText } from "@/lib/server/sanitize";
import { api, bad, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { TOOLS } from "@/lib/agent/tools";
import { CONTACT_STATUSES, CONTACT_TYPES } from "@/lib/types";

export const GET = api(async ({ profile }) => {
  const ctx = await buildCtx(profile);
  const contacts = await ctx.store.list("contacts", profile.id);
  return { contacts: contacts.sort((a, b) => a.name.localeCompare(b.name)) };
});

export const POST = api(async ({ profile, req }) => {
  const b = await readJson(req);
  if (typeof b.name !== "string" || !b.name.trim()) throw bad("A contact needs a name.");
  if (b.type && !(CONTACT_TYPES as readonly string[]).includes(b.type)) throw bad("Unknown contact type.");
  if (b.status && !(CONTACT_STATUSES as readonly string[]).includes(b.status)) throw bad("Unknown status.");
  const s = (v: unknown, n: number) => (v == null || v === "" ? null : cleanText(v, n, true));
  const ctx = await buildCtx(profile);
  const r = await TOOLS.create_contact.run(ctx, { ...b, name: cleanText(b.name, 120), email: s(b.email, 254), phone: s(b.phone, 40), notes: s(b.notes, 4000), location: s(b.location, 120), timeline: s(b.timeline, 120), tags: Array.isArray(b.tags) ? b.tags.slice(0, 20).map((t: unknown) => cleanText(t, 40)).filter(Boolean) : [], source: b.source ? cleanText(b.source, 80) : "Added manually" });
  if (!r.ok) throw bad(r.message);
  return r.data;
});
