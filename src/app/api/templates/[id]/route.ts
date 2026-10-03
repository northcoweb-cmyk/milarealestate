import { api, notFound, readJson, bad } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { extractVariables } from "@/lib/agent/templates";

export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson(req);
  const store = getStore();
  const cur = await store.get("document_templates", profile.id, params.id);
  if (!cur) throw notFound("That template");
  const patch: Record<string, unknown> = {};
  if (typeof b.name === "string") patch.name = b.name.slice(0, 120);
  if (typeof b.body === "string") { if (b.body.length > 50_000) throw bad("That template is too long."); patch.body = b.body; patch.variables = extractVariables(b.body); }
  if (typeof b.is_default === "boolean") {
    patch.is_default = b.is_default;
    if (b.is_default) for (const t of (await store.list("document_templates", profile.id)).filter((x) => x.kind === cur.kind && x.is_default && x.id !== cur.id)) await store.update("document_templates", profile.id, t.id, { is_default: false });
  }
  return { template: await store.update("document_templates", profile.id, cur.id, patch) };
});

export const DELETE = api<{ id: string }>(async ({ profile, params, url }) => {
  if (url.searchParams.get("confirm") !== "1") throw bad("Deleting needs confirmation.");
  if (!(await getStore().remove("document_templates", profile.id, params.id))) throw notFound("That template");
  return { ok: true };
});
