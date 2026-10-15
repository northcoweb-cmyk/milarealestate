import { Shell } from "@/components/shell";
import { Bars, Missing, Pill, Section, Stat } from "@/components/ui";
import { usd, usd2 } from "@/lib/data";
import { NoKeys, load } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function Spend() {
  const r = await load();
  if (!r) return <Shell title="AI spend"><NoKeys /></Shell>;
  const k = r.kpis;
  const pr = r.profit;
  const cap = Number(process.env.MILA_DAILY_AI_BUDGET_USD || 40);
  return (
    <Shell title="AI spend" lead="What the AI and photo lookups cost, per day, model and user.">
      <Missing tables={r.missing.filter((m) => ["usage", "api_usage"].includes(m))} />
      <Section title="Profit (last 30 days)">
        <div className="grid g4">
          <Stat label="Monthly revenue" value={usd2(pr.mrr)} sub={`${pr.paying} paying · avg ${usd2(pr.arpu)} each`} />
          <Stat label="Cost: paying users" value={usd2(pr.costPaying)} sub={pr.paying ? `${usd2(pr.costPerPaying)} per paying user` : "no paying users yet"} />
          <Stat label="Cost: free trials & tests" value={usd2(pr.costFree)} sub="the price of acquiring users" />
          <Stat label="Gross profit" value={usd2(pr.gross)} sub={pr.margin === null ? "after AI, data and payment fees" : `${Math.round(pr.margin * 100)}% margin after AI, data and fees (${usd2(pr.fees)})`} tone={pr.gross < 0 ? "bad" : pr.margin !== null && pr.margin < 0.4 ? "warn" : "ok"} />
        </div>
      </Section>
      <Section title="Every customer: credits, cost, paid and profit">
        <p className="mute" style={{ margin: "-4px 0 10px", fontSize: 13 }}>Paid = their plan price plus any credit packs they bought. Cost = AI and data lookups over the last 60 days. Profit = paid − cost − payment fees. Free trials show $0 paid, so their cost shows as a loss.</p>
        <div className="tw"><table><thead><tr><th>Customer</th><th>Status</th><th className="n">Credits left</th><th className="n">Used (this period)</th><th className="n">Used (all time)</th><th className="n">AI cost</th><th className="n">Data cost</th><th className="n">Paid</th><th className="n">Profit</th></tr></thead><tbody>
          {r.customers.map((u) => {
            const pctLeft = u.allowance ? Math.max(0, Math.min(100, Math.round((u.balance / u.allowance) * 100))) : 0;
            return (
              <tr key={u.id}>
                <td>{u.name}<br /><span className="mute">{u.email}</span></td>
                <td><Pill tone={u.state === "paid" ? "ok" : u.state === "trial" ? "warn" : u.state === "trial ended" ? "bad" : "mute"}>{u.state}{u.trialDay ? ` · day ${u.trialDay}` : ""}</Pill>{u.state === "paid" && <><br /><span className="mute">{u.plan.replace("_", " ")}</span></>}</td>
                <td className="n"><b>{u.balance.toLocaleString()}</b>{u.allowance ? <span className="mute"> / {u.allowance.toLocaleString()}</span> : null}{u.allowance ? <div style={{ height: 4, borderRadius: 4, background: "var(--line)", marginTop: 5 }}><div style={{ width: `${pctLeft}%`, height: 4, borderRadius: 4, background: pctLeft < 20 ? "var(--bad)" : "var(--accent, #a68cff)" }} /></div> : null}</td>
                <td className="n">{u.usedPeriod.toLocaleString()}</td>
                <td className="n">{u.usedTotal.toLocaleString()}</td>
                <td className="n">{usd2(u.ai)}</td>
                <td className="n">{usd2(u.data)}</td>
                <td className="n">{u.revenue ? usd2(u.revenue) : "—"}</td>
                <td className="n" style={{ fontWeight: 700, color: u.profit < 0 ? "var(--bad, #c0392b)" : u.profit > 0 ? "var(--ok, #2e9e6b)" : undefined }}>{usd2(u.profit)}</td>
              </tr>
            );
          })}
          {!r.customers.length && <tr><td colSpan={9} className="mute">No customers yet.</td></tr>}
        </tbody></table></div>
      </Section>
      <Section title="AI spend">
        <div className="grid g3">
          <Stat label="Today" value={usd2(k.aiToday)} sub={`daily cap ${usd2(cap)}`} tone={k.aiToday > cap * 0.7 ? "warn" : undefined} />
          <Stat label="Last 30 days" value={usd2(k.ai30d)} sub="AI only" />
          <Stat label="Per active user (7d)" value={k.active7d ? usd2(k.ai30d / Math.max(1, k.active7d)) : "—"} sub="rough, 30-day cost" />
        </div>
      </Section>
      <Section title="Cost per day"><div className="card"><Bars data={r.costByDay} fmt={usd} /></div></Section>
      <div className="grid g2">
        <Section title="By model"><div className="tw"><table><thead><tr><th>Model</th><th className="n">Calls</th><th className="n">Cost</th></tr></thead><tbody>{r.spend.byModel.map((m) => <tr key={m.model}><td>{m.model}</td><td className="n">{m.calls}</td><td className="n">{usd(m.cost)}</td></tr>)}{!r.spend.byModel.length && <tr><td colSpan={3} className="mute">No usage yet.</td></tr>}</tbody></table></div></Section>
        <Section title="Photo and data lookups (30d)"><div className="tw"><table><thead><tr><th>Provider</th><th className="n">Calls</th><th className="n">Failed</th><th className="n">Cost</th></tr></thead><tbody>{r.spend.api.map((a) => <tr key={a.provider}><td>{a.provider}</td><td className="n">{a.calls}</td><td className="n">{a.failed}</td><td className="n">{usd(a.cost)}</td></tr>)}{!r.spend.api.length && <tr><td colSpan={4} className="mute">None yet.</td></tr>}</tbody></table></div></Section>
      </div>
      <Section title="What costs the most (by feature)"><div className="tw"><table><thead><tr><th>Feature</th><th className="n">Calls</th><th className="n">Cost</th><th className="n">Per call</th></tr></thead><tbody>{r.spend.byOp.map((o) => <tr key={o.op}><td>{o.op}</td><td className="n">{o.calls}</td><td className="n">{usd(o.cost)}</td><td className="n">{usd(o.cost / Math.max(1, o.calls))}</td></tr>)}{!r.spend.byOp.length && <tr><td colSpan={4} className="mute">No usage yet.</td></tr>}</tbody></table></div></Section>
    </Shell>
  );
}
