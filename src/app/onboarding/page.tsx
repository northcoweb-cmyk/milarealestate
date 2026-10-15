import { authMode } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { googleConfigured } from "@/lib/integrations/google";
import { isNoDemo } from "@/lib/fresh-accounts";
import { PublicSky } from "@/components/public-sky";
import { OnboardingFlow } from "./flow";

export const dynamic = "force-dynamic";

export default async function Onboarding() {
  const p = await getProfile();
  if (!p) redirect("/welcome");
  if (p.onboarded) redirect("/");
  return (
    <>
      <PublicSky />
      <OnboardingFlow name={p.full_name} googleConfigured={googleConfigured()} allowSample={authMode() !== "supabase" && !isNoDemo(p.email)} />
    </>
  );
}
