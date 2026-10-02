import { api } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { buildFeed } from "@/lib/feed";

export const GET = api(async ({ profile }) => ({ feed: await buildFeed(await buildCtx(profile)) }));
