import Link from "next/link";
import { Shell } from "@/components/shell";
import { Bars, Missing, Section, Stat } from "@/components/ui";
import { ago, fmt } from "@/lib/data";
import { NoKeys, load } from "@/lib/page";
import { GrantButton } from "@/components/grant-button";
import { GrantNext } from "@/components/grant-next";
import { DeleteWaitlistButton } from "@/components/delete-waitlist-button";


export const dynamic = "force-dynamic";

type Row = { id: string; email: string; name: string | null; source: string | null; created_at: string; status?: string | null; invited_at?: string | null; claimed_at?: string | null };
function PeopleTable({ rows, now, empty, granted }: { rows: Row[]; now: string | number | Date; empty: string; granted: boolean }) {
  return (
    <div className="tw"><table><thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>
      {rows.slice(0, 300).map((w) => (
        <tr key={w.id}><td>{w.email}</td><td>{w.name ?? <span className="mute">—</span>}</td><td>{w.source ?? "direct"}</td>
          <td>{w.claimed_at ? "Has an account" : granted ? "Access sent, hasn't signed in yet" : "In the queue"}</td>
          <td title={fmt(w.created_at)}>{ago(w.created_at, now as never)}</td>
          <td style={{ whiteSpace: "nowrap" }}>{!w.claimed_at && <GrantButton id={w.id} email={w.email} label={granted ? "Resend access" : "Grant access"} />} <DeleteWaitlistButton id={w.id} email={w.email} /></td></tr>
      ))}
      {!rows.length && <tr><td colSpan={6} className="mute">{empty}</td></tr>}
    </tbody></table></div>
  );
}

export default async function Waitlist() {
  const r = await load();
  if (!r) return <Shell title="Waitlist"><NoKeys /></Shell>;
  const k = r.kpis;
  const isGranted = (w: (typeof r.wait)[number]) => !!(w.claimed_at || w.invited_at || w.status === "invited" || w.status === "joined");
  const queue = r.wait.filter((w) => !isGranted(w)).sort((a, b) => a.created_at.localeCompare(b.created_at)); // oldest first: that's who gets in next
  const granted = r.wait.filter(isGranted).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <Shell title="Waitlist" lead="Everyone who joined before launch." right={<a className="btn primary" href="/api/waitlist-csv">Download CSV</a>}>
      <Missing tables={r.missing.filter((m) => m === "waitlist")} />
      <div className="grid g4">
        <Stat label="Total" value={k.waitlist} /><Stat label="Last 24 hours" value={k.wait24h} /><Stat label="Last 7 days" value={k.wait7d} />
        <Stat label="Queued (over the cap)" value={r.wait.filter((w) => w.status === "queued").length} sub="waiting for you to grant access" /><Stat label="Already have an account" value={r.waitToAccount.joined} sub={`of ${r.waitToAccount.of}`} />
      </div>
      <div className="grid g2">
        <Section title="Signups per day"><div className="card"><Bars data={r.waitByDay} /></div></Section>
        <Section title="Where they came from"><div className="card">{r.waitSources.length ? r.waitSources.map(([s, n]) => <p key={s} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}><span>{s}</span><b>{n}</b></p>) : <p className="mute">No signups yet. Pass ?src=instagram (or tiktok, x) on your link so you can see which post works.</p>}</div></Section>
      </div>
      <Section title="Let people in"><GrantNext waiting={queue.length} /></Section>
      <Section title={`In the queue (${queue.length}): waiting for you`}>
        <PeopleTable rows={queue} now={r.now} empty="Nobody is waiting. New sign-ups land here instantly." granted={false} />
      </Section>
      <Section title={`Access granted (${granted.length})`}>
        <PeopleTable rows={granted} now={r.now} empty="Nobody has been let in yet." granted />
        <p className="mute" style={{ marginTop: 10, fontSize: 13 }}>Showing the latest 300 of each. <Link href="/api/waitlist-csv" style={{ textDecoration: "underline" }}>Download everyone</Link>.</p>
      </Section>
    </Shell>
  );
}
