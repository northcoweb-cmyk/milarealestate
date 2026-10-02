import { api } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { buildTimeline } from "@/lib/feed";

export const GET = api(async ({ profile, url }) => ({ ...(await buildTimeline(await buildCtx(profile), Math.min(Math.max(Number(url.searchParams.get("days")) || 14, 1), 60))) }));
