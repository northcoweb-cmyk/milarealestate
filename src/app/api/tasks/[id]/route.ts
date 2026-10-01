import { api, notFound, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { TOOLS } from "@/lib/agent/tools";

export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson(req);
  const ctx = await buildCtx(profile);
  if (b.reopen) { const t = await ctx.store.update("tasks", profile.id, params.id, { status: "open", completed_at: null }); if (!t) throw notFound("That task"); return { task: t }; }
  const r = await TOOLS.complete_task.run(ctx, { id: params.id, dismiss: !!b.dismiss });
  if (!r.ok) throw notFound("That task");
  return r.data;
});
