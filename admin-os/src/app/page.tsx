import { Shell } from "@/components/shell";
import { Bars, Funnel, Missing, Pill, Section, Stat } from "@/components/ui";
import { ago, usd } from "@/lib/data";
import { NoKeys, load } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const r = await load();
  if (!r) return <Shell title="Overview"><NoKeys /></Shell>;
  const k = r.kpis;
  const alerts: { tone: "bad" | "warn" | "ok"; text: string }[] = [];
  if (k.errors24h > 0) alerts.push({ tone: k.errors24h > 10 ? "bad" : "warn", text: `${k.errors24h} ${k.errors24h === 1 ? "error" : "errors"} in the last 24 hours (${k.openErrors} open ${k.openErrors === 1 ? "issue type" : "issue types"})` });
  if (r.kpis.aiToday > 20) alerts.push({ tone: "warn", text: `AI spend today is ${usd(k.aiToday)}` });
  if (r.users.some((u) => u.state === "trial ended")) alerts.push({ tone: "warn", text: `${r.users.filter((u) => u.state === "trial ended").length} trials ended without paying` });
  if (!alerts.length) alerts.push({ tone: "ok", text: "Nothing needs attention right now." });
  return (
    <Shell title="Overview" lead="Everything about the waitlist, the app, your users and your errors in one place.">
      <Missing tables={r.missing} />
      <div className="grid g4">
        <Stat label="Waitlist" value={k.waitlist} sub={`+${k.wait24h} today · +${k.wait7d} this week`} />
        <Stat label="App users" value={k.users} sub={`+${k.signups24h} today · ${k.testUsers} test accounts hidden`} />
        <Stat label="Active (7 days)" value={k.active7d} sub={`${k.active24h} in the last 24h`} />
        <Stat label="On trial" value={k.trials} sub={`${k.paid} paying`} />
        <Stat label="Errors (24h)" value={k.errors24h} tone={k.errors24h ? (k.errors24h > 10 ? "bad" : "warn") : "ok"} sub={`${k.openErrors} open issue types`} />
        <Stat label="AI spend today" value={usd(k.aiToday)} sub={`${usd(k.ai30d)} in 30 days`} />
      </div>
      <Section title="Needs attention">
        <div className="card">{alerts.map((a, i) => <p key={i} style={{ padding: "6px 0" }}><Pill tone={a.tone === "ok" ? "ok" : a.tone}>{a.tone === "ok" ? "OK" : a.tone === "bad" ? "Urgent" : "Watch"}</Pill> &nbsp;{a.text}</p>)}</div>
      </Section>
      <div className="grid g2">
        <Section title="Waitlist signups (30 days)"><div className="card"><Bars data={r.waitByDay} /></div></Section>
        <Section title="App signups (30 days)"><div className="card"><Bars data={r.signupsByDay} /></div></Section>
        <Section title="Daily active users"><div className="card"><Bars data={r.dau} /></div></Section>
        <Section title="Journey from waitlist to paying"><div className="card"><Funnel steps={r.growth} /></div></Section>
      </div>
      <Section title="Latest signups">
        <div className="tw"><table><thead><tr><th>Who</th><th>Joined</th><th>Plan</th><th>Last active</th></tr></thead><tbody>
          {r.users.slice(0, 8).map((u) => <tr key={u.id}><td>{u.name}<br /><span className="mute">{u.email}</span></td><td>{ago(u.created_at, r.now)}</td><td><Pill tone={u.state === "paid" ? "ok" : u.state === "trial" ? "warn" : "mute"}>{u.state}{u.trialDay ? ` · day ${u.trialDay}` : ""}</Pill></td><td>{ago(u.last, r.now)}</td></tr>)}
          {!r.users.length && <tr><td colSpan={4} className="mute">No accounts yet.</td></tr>}
        </tbody></table></div>
      </Section>
    </Shell>
  );
}
