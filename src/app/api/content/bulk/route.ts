import { api, bad, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { approvePlanned, setPostStatus } from "@/lib/content/service";

export const POST = api(async ({ profile, req }) => {
  const b = await readJson<{ ids?: string[]; action: "approve_schedule" | "archive" }>(req);
  const ctx = await buildCtx(profile);
  const ids = (b.ids ?? []).slice(0, 100);
  if (b.action === "approve_schedule") return await approvePlanned(ctx, ids.length ? ids : undefined);
  if (b.action === "archive") {
    let n = 0;
    for (const id of ids) { const p = await ctx.store.get("social_posts", profile.id, id); if (p) { await setPostStatus(ctx, p, "archive"); n++; } }
    return { archived: n };
  }
  throw bad("Unknown action.");
});
