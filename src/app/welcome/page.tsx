import { redirect } from "next/navigation";
import { authMode, getProfile, localAuthAllowed } from "@/lib/auth";
import { PublicSky } from "@/components/public-sky";
import { WelcomeForm } from "./welcome-form";

export const dynamic = "force-dynamic";

export default async function Welcome() {
  const p = await getProfile();
  if (p) redirect(p.onboarded ? "/" : "/onboarding");
  return (
    <>
      <PublicSky />
      <main className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col justify-center px-5 py-10">
        <p className="display mb-2 text-center text-[56px]">Mila</p>
        <p className="muted mb-9 text-center text-[19px]">Your AI operations manager for real estate.</p>
        <WelcomeForm mode={authMode()} localAllowed={localAuthAllowed()} />
        <p className="faint mt-8 text-center text-[13px]">Tell Mila what you want done. She works out which of your tools to use — and asks before anything goes out.</p>
      </main>
    </>
  );
}
