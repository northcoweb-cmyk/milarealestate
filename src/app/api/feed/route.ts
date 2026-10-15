import { api } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { buildFeed } from "@/lib/feed";
import { expireStale } from "@/lib/agent/overdue";

export const GET = api(async ({ profile }) => {
  const ctx = await buildCtx(profile);
  await expireStale(ctx); // pre-event posts and prep for events that already happened stop showing
  return { feed: await buildFeed(ctx) };
});
