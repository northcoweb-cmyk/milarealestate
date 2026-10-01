import { api } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { loadShowings } from "@/lib/showings";

export const GET = api(async ({ profile, url }) => {
  const ctx = await buildCtx(profile);
  return { showings: await loadShowings(ctx, Number(url.searchParams.get("days") ?? 10), 12) };
});
