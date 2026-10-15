import { Shell } from "@/components/shell";
import { InvitePanel } from "@/components/invite-panel";
import { Section, Stat } from "@/components/ui";
import { isAuthed } from "@/lib/auth";
import { AnnouncePanel } from "@/components/announce-panel";
import { DESIGNS, daysLeft } from "@/lib/announce";
import { announceCounts, appUrl, counts, smtpConfigured } from "@/lib/invites";
import { configured } from "@/lib/sb";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Invites() {
  if (!(await isAuthed())) redirect("/login");
  const c = configured() ? await counts() : null;
  const a = configured() ? await announceCounts() : null;
  return (
    <Shell title="Invites" lead="On launch day, email everyone on the waitlist their personal link. They sign in with the email they joined with, create a password, and do onboarding.">
      {!c && <div className="note warn">Couldn&apos;t read the waitlist. Run <b>0005_waitlist.sql</b> and <b>0006_waitlist_invites.sql</b> in the Supabase SQL editor, then refresh.</div>}
      {c && <div className="grid g4"><Stat label="On the waitlist" value={c.total} /><Stat label="Invited" value={c.invited} /><Stat label="Created an account" value={c.claimed} /><Stat label="Not invited yet" value={c.pending} /></div>}
      <Section title="Launch countdown email">
        <p className="lead" style={{ marginBottom: 12 }}>A different email from the invite: it tells the waitlist how many days are left and what Mila does, by their sign-up name. Pick a design, preview it, send yourself a test, then send in batches.</p>
        <AnnouncePanel designs={[...DESIGNS]} days={daysLeft()} pending={a?.pending ?? 0} sent={a?.announced ?? 0} ready={!!a} defaultEmail={process.env.ADMIN_OS_EMAIL ?? ""} smtp={smtpConfigured()} />
      </Section>
      <Section title="Send invites"><InvitePanel pending={c?.pending ?? 0} defaultEmail={process.env.ADMIN_OS_EMAIL ?? ""} smtp={smtpConfigured()} /></Section>
      <Section title="How it works"><div className="card"><ol style={{ margin: 0, paddingLeft: 20, color: "var(--soft)", lineHeight: 1.7 }}>
        <li>Each person gets a private link: <span className="mute">{appUrl()}/claim?t=…</span></li>
        <li>The link only works for the email they joined with, once, for 45 days.</li>
        <li>They pick a password, then land in onboarding. Their 7-day trial starts there.</li>
        <li>If someone loses the email, send a test to their address or ask them to reply.</li>
      </ol></div></Section>
    </Shell>
  );
}
