import { api, notFound } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { buildClientBrief } from "@/lib/agent/client-brief";

export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const ctx = await buildCtx(profile);
  const contact = await ctx.store.get("contacts", profile.id, params.id);
  if (!contact) throw notFound("That contact");
  return { brief: await buildClientBrief(ctx, contact) };
});
