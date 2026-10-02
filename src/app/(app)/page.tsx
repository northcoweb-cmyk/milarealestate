import { requireProfile } from "@/lib/auth";
import { greetingFor } from "@/lib/agent/debrief";
import { HomeClient, type HomeData } from "@/components/home-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await requireProfile();
  // Only what's needed for the first paint. The feed loads right after, so tapping Home responds instantly.
  const now = new Date();
  const data: HomeData = {
    greeting: greetingFor(now, profile.timezone, profile.full_name),
    firstName: profile.full_name.split(" ")[0],
    dateLine: new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, weekday: "long", month: "long", day: "numeric" }).format(now),
    feed: null,
    isDemo: profile.is_demo,
  };
  return <HomeClient data={data} />;
}
