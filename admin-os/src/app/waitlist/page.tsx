import Link from "next/link";
import { Shell } from "@/components/shell";
import { Bars, Missing, Section, Stat } from "@/components/ui";
import { ago, fmt } from "@/lib/data";
import { NoKeys, load } from "@/lib/page";
import { GrantButton } from "@/components/grant-button";

const STATUS: Record<string, string> = { waiting: "On the list", queued: "Queued", invited: "Access granted", joined: "Has account" };

export const dynamic = "force-dynamic";

export default async function Waitlist() {
  const r = await load();
  if (!r) return <Shell title="Waitlist"><NoKeys /></Shell>;
  const k = r.kpis;
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
      <Section title="People">
        <div className="tw"><table><thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>
          {r.wait.slice(0, 300).map((w) => <tr key={w.id}><td>{w.email}</td><td>{w.name ?? <span className="mute">—</span>}</td><td>{w.source ?? "direct"}</td><td>{w.claimed_at ? STATUS.joined : STATUS[w.status ?? "waiting"] ?? w.status}</td><td title={fmt(w.created_at)}>{ago(w.created_at, r.now)}</td><td>{!w.claimed_at && <GrantButton id={w.id} email={w.email} />}</td></tr>)}
          {!r.wait.length && <tr><td colSpan={6} className="mute">Empty for now. Once the waitlist page is live, signups land here instantly.</td></tr>}
        </tbody></table></div>
        <p className="mute" style={{ marginTop: 10, fontSize: 13 }}>Showing the latest 300. <Link href="/api/waitlist-csv" style={{ textDecoration: "underline" }}>Download everyone</Link>.</p>
      </Section>
    </Shell>
  );
}
