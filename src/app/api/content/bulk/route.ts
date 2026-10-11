import { api, bad, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { approvePlanned, setPostStatus } from "@/lib/content/service";

export const POST = api(async ({ profile, req }) => {
  const b = await readJson<{ ids?: string[]; action: "approve_schedule" | "archive"; confirm?: boolean }>(req);
  const ctx = await buildCtx(profile);
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x): x is string => typeof x === "string").slice(0, 100);
  // "everything planned" (no ids) and bulk archives (more than 10) only run with an explicit confirm: true from the person.
  if (b.action === "approve_schedule" && !ids.length && b.confirm !== true) throw bad("Approving every planned post needs confirmation.");
  if (b.action === "archive" && ids.length > 10 && b.confirm !== true) throw bad("Archiving this many posts needs confirmation.");
  if (b.action === "approve_schedule") return await approvePlanned(ctx, ids.length ? ids : undefined);
  if (b.action === "archive") {
    let n = 0;
    for (const id of ids) { const p = await ctx.store.get("social_posts", profile.id, id); if (p) { await setPostStatus(ctx, p, "archive"); n++; } }
    return { archived: n };
  }
  throw bad("Unknown action.");
});
