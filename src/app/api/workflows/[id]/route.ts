import { api, notFound, readJson } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

// Workflows are editable: rename, toggle, reorder/remove/add steps.
export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson(req);
  const patch: Record<string, unknown> = {};
  if (typeof b.name === "string") patch.name = b.name.slice(0, 80);
  if (typeof b.description === "string") patch.description = b.description.slice(0, 300);
  if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
  if (Array.isArray(b.steps)) patch.steps = b.steps.slice(0, 30).map((s: any) => ({ tool: String(s.tool ?? "create_task"), label: String(s.label ?? "").slice(0, 120), optional: !!s.optional })).filter((s: any) => s.label);
  const w = await getStore().update("workflows", profile.id, params.id, patch);
  if (!w) throw notFound("That workflow");
  return { workflow: w };
});
