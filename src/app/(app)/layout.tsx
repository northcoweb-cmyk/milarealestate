import { redirect } from "next/navigation";
import { getProfile, isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { creditSummary } from "@/lib/credits";
import { aiAvailable } from "@/lib/ai/provider";
import { googleConfigured } from "@/lib/integrations/google";
import { AppProvider } from "@/components/app-context";
import { Shell } from "@/components/shell";
import { MilaProvider } from "@/components/mila-chat";
import { Sky } from "@/components/sky";
import { LiquidGlassDefs } from "@/components/ui/liquid-weather-glass";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/welcome");
  if (!profile.onboarded) redirect("/onboarding");
  const [credits, tasks] = await Promise.all([creditSummary(profile.id), getStore().list("tasks", profile.id)]);
  const approvals = tasks.filter((t) => t.kind === "approval" && t.status === "open").length;
  return (
    <AppProvider initial={{ profile, admin: isAdmin(profile), credits: { balance: credits.balance, allowance: credits.allowance, resetsAt: credits.resetsAt }, capabilities: { ai: aiAvailable(), google: googleConfigured() } }}>
      <Sky initialNow={new Date().toISOString()} tz={profile.timezone} lat={profile.lat} lng={profile.lng} theme={profile.settings.appearance.theme} reduceMotion={profile.settings.appearance.reduce_motion} animated={profile.settings.appearance.animated_sky === true} />
      <LiquidGlassDefs />
      <MilaProvider><Shell approvals={approvals}>{children}</Shell></MilaProvider>
    </AppProvider>
  );
}
