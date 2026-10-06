import Link from "next/link";
import { PublicSky } from "@/components/public-sky";
import { inviteFor } from "@/lib/waitlist";
import { authMode } from "@/lib/auth";
import { ClaimForm } from "./claim-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Claim your account", robots: { index: false, follow: false } };

export default async function Claim({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const inv = await inviteFor(t);
  return (
    <>
      <PublicSky />
      <main className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col justify-center px-5 py-10">
        <p className="display mb-2 text-center text-[56px]">Mila</p>
        {inv.ok ? (
          <>
            <p className="muted mb-8 text-center text-[19px]">You&apos;re in. Welcome{inv.entry.name ? `, ${inv.entry.name.split(" ")[0]}` : ""}.</p>
            <ClaimForm token={t!} email={inv.entry.email} needsPassword={authMode() === "supabase"} />
          </>
        ) : (
          <div className="glass-strong space-y-3 p-6 text-center" style={{ borderRadius: 32 }}>
            <h1 className="h2">{inv.reason === "used" ? "Already claimed" : inv.reason === "expired" ? "This link expired" : "This link isn't valid"}</h1>
            <p className="muted text-[15.5px]">{inv.reason === "used" ? "This invite was already used. Sign in with your email and password." : inv.reason === "expired" ? "Reply to your invite email and we'll send you a new one." : "Open the newest email from Mila and use the button in it."}</p>
            <Link href="/welcome" className="btn btn-primary w-full">Go to sign in</Link>
          </div>
        )}
      </main>
    </>
  );
}
