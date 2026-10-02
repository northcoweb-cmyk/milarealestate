import { requireProfile } from "@/lib/auth";
import { buildCtx } from "@/lib/agent/engine";
import { greetingFor } from "@/lib/agent/debrief";
import { buildFeed } from "@/lib/feed";
import { HomeClient, type HomeData } from "@/components/home-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await requireProfile();
  const ctx = await buildCtx(profile);
  const data: HomeData = {
    greeting: greetingFor(ctx.now, ctx.tz, profile.full_name),
    firstName: profile.full_name.split(" ")[0],
    dateLine: new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, weekday: "long", month: "long", day: "numeric" }).format(ctx.now),
    feed: await buildFeed(ctx),
    isDemo: profile.is_demo,
  };
  return <HomeClient data={data} />;
}
