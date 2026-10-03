import { api, bad, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { extractVariables } from "@/lib/agent/templates";
import type { TemplateKind } from "@/lib/types";

const KINDS: TemplateKind[] = ["buyer_document", "seller_document", "follow_up", "email", "social", "open_house", "checklist"];

export const GET = api(async ({ profile }) => ({ templates: (await getStore().list("document_templates", profile.id)).sort((a, b) => a.name.localeCompare(b.name)) }));

export const POST = api(async ({ profile, req }) => {
  const b = await readJson(req);
  if (typeof b.name !== "string" || typeof b.body !== "string" || !b.name.trim() || !b.body.trim()) throw bad("Give the template a name and some text.");
  if (b.name.length > 120 || b.body.length > 50_000) throw bad("That template is too long.");
  if (!KINDS.includes(b.kind)) throw bad("Unknown template type.");
  const store = getStore();
  if (b.is_default) for (const t of (await store.list("document_templates", profile.id)).filter((x) => x.kind === b.kind && x.is_default)) await store.update("document_templates", profile.id, t.id, { is_default: false });
  return { template: await store.insert("document_templates", profile.id, { name: b.name.trim(), kind: b.kind, body: b.body, variables: extractVariables(b.body), document_id: null, is_default: !!b.is_default }) };
});
