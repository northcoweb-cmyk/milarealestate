import { Shell } from "@/components/shell";
import { Bars, Missing, Section, Stat } from "@/components/ui";
import { usd } from "@/lib/data";
import { NoKeys, load } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function Spend() {
  const r = await load();
  if (!r) return <Shell title="AI spend"><NoKeys /></Shell>;
  const k = r.kpis;
  const cap = Number(process.env.MILA_DAILY_AI_BUDGET_USD || 40);
  return (
    <Shell title="AI spend" lead="What the AI and photo lookups cost, per day, model and user.">
      <Missing tables={r.missing.filter((m) => ["usage", "api_usage"].includes(m))} />
      <div className="grid g4">
        <Stat label="Today" value={usd(k.aiToday)} sub={`daily cap ${usd(cap)}`} tone={k.aiToday > cap * 0.7 ? "warn" : undefined} />
        <Stat label="Last 30 days" value={usd(k.ai30d)} />
        <Stat label="Per active user (7d)" value={k.active7d ? usd(k.ai30d / Math.max(1, k.active7d)) : "—"} sub="rough, 30-day cost" />
      </div>
      <Section title="Cost per day"><div className="card"><Bars data={r.costByDay} fmt={usd} /></div></Section>
      <div className="grid g2">
        <Section title="By model"><div className="tw"><table><thead><tr><th>Model</th><th className="n">Calls</th><th className="n">Cost</th></tr></thead><tbody>{r.spend.byModel.map((m) => <tr key={m.model}><td>{m.model}</td><td className="n">{m.calls}</td><td className="n">{usd(m.cost)}</td></tr>)}{!r.spend.byModel.length && <tr><td colSpan={3} className="mute">No usage yet.</td></tr>}</tbody></table></div></Section>
        <Section title="Photo and data lookups (30d)"><div className="tw"><table><thead><tr><th>Provider</th><th className="n">Calls</th><th className="n">Failed</th><th className="n">Cost</th></tr></thead><tbody>{r.spend.api.map((a) => <tr key={a.provider}><td>{a.provider}</td><td className="n">{a.calls}</td><td className="n">{a.failed}</td><td className="n">{usd(a.cost)}</td></tr>)}{!r.spend.api.length && <tr><td colSpan={4} className="mute">None yet.</td></tr>}</tbody></table></div></Section>
      </div>
      <Section title="Most expensive users"><div className="tw"><table><thead><tr><th>User</th><th className="n">Requests</th><th className="n">Cost (60d)</th></tr></thead><tbody>{r.spend.byUser.map((u) => <tr key={u.email}><td>{u.email}</td><td className="n">{u.turns}</td><td className="n">{usd(u.cost)}</td></tr>)}{!r.spend.byUser.length && <tr><td colSpan={3} className="mute">No usage yet.</td></tr>}</tbody></table></div></Section>
    </Shell>
  );
}
