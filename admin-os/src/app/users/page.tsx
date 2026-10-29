import Link from "next/link";
import { Shell } from "@/components/shell";
import { Missing, Pill, Section } from "@/components/ui";
import { ago, usd } from "@/lib/data";
import { NoKeys, load } from "@/lib/page";
import { DeleteUserButton } from "@/components/delete-user-button";

export const dynamic = "force-dynamic";

export default async function Users() {
  const r = await load();
  if (!r) return <Shell title="Users"><NoKeys /></Shell>;
  const lapsed = r.users.filter((u) => !["paid", "trial", "none"].includes(u.state));
  const users = r.users.filter((u) => !lapsed.includes(u));
  return (
    <Shell title="Users" lead={`${users.length} active accounts. Test and demo accounts are hidden. Delete removes an account and all its data and frees the email.`}>
      {lapsed.length > 0 && <div className="note" style={{ marginBottom: 12 }}>{lapsed.length} {lapsed.length === 1 ? "person's" : "people's"} trial ended without a plan. They&apos;re kept out of this list: <Link href="/lapsed"><b>open Lapsed</b></Link> to email them.</div>}
      <Missing tables={r.missing} />
      <Section title="All accounts">
        <div className="tw"><table><thead><tr><th>Who</th><th>Joined</th><th>Onboarded</th><th>Plan</th><th>Last active</th><th className="n">Requests</th><th className="n">AI cost</th><th></th></tr></thead><tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}<br /><span className="mute">{u.email}{u.brokerage ? ` · ${u.brokerage}` : ""}</span></td>
              <td>{ago(u.created_at, r.now)}</td>
              <td>{u.onboarded ? <Pill tone="ok">Yes</Pill> : <Pill tone="warn">No</Pill>}</td>
              <td><Pill tone={u.state === "paid" ? "ok" : u.state === "trial" ? "warn" : u.state === "trial ended" ? "bad" : "mute"}>{u.state}{u.trialDay ? ` · day ${u.trialDay}` : ""}</Pill></td>
              <td>{ago(u.last, r.now)}</td><td className="n">{u.turns}</td><td className="n">{usd(u.cost)}</td><td><DeleteUserButton id={u.id} email={u.email} /></td>
            </tr>
          ))}
          {!users.length && <tr><td colSpan={8} className="mute">No accounts yet.</td></tr>}
        </tbody></table></div>
      </Section>
    </Shell>
  );
}
