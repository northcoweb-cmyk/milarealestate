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
  if (!b.name?.trim()) throw bad("A contact needs a name.");
  if (b.type && !(CONTACT_TYPES as readonly string[]).includes(b.type)) throw bad("Unknown contact type.");
  if (b.status && !(CONTACT_STATUSES as readonly string[]).includes(b.status)) throw bad("Unknown status.");
  const ctx = await buildCtx(profile);
  const r = await TOOLS.create_contact.run(ctx, { ...b, source: b.source ?? "Added manually" });
  if (!r.ok) throw bad(r.message);
  return r.data;
});
