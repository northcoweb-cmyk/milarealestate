import { Shell } from "@/components/shell";
import { Bars, Missing, Pill, Section, Stat } from "@/components/ui";
import { usd, usd2 } from "@/lib/data";
import { NoKeys, load } from "@/lib/page";


// Mirrors src/lib/config.ts (plans, packs, trial). Update both if pricing changes.
const CREDIT_ROWS: { name: string; price: number; credits: number; ceiling: number; note?: string }[] = [
  { name: "Mila (monthly)", price: 39, credits: 1200, ceiling: 11.5 },
  { name: "Mila Annual (per month of credits)", price: 390 / 12, credits: 1200, ceiling: 9.5, note: "+500 bonus credits once, so 1,200 a month plus 500 up front" },
  { name: "Team", price: 299, credits: 12000, ceiling: 85 },
  { name: "Pack: 200 credits", price: 10, credits: 200, ceiling: 2 },
  { name: "Pack: 500 credits", price: 25, credits: 500, ceiling: 5 },
  { name: "Pack: 1,000 credits", price: 50, credits: 1000, ceiling: 10 },
];
const c4 = (n: number) => `$${n.toFixed(4)}`;

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
      <Section title="What one credit is worth">
        <p className="mute" style={{ margin: "-4px 0 10px", fontSize: 13 }}>Customer side = what they pay for each credit. Our side = the most AI and data we spend on that credit (about 1 cent; a turn that uses more AI costs more credits), plus Stripe fees (2.9% + $0.30). Margin assumes they use every credit at the ceiling, the worst case. Real use is usually lower.</p>
        <div className="tw"><table><thead><tr><th>Where credits come from</th><th className="n">They pay</th><th className="n">Credits</th><th className="n">Customer: $ per credit</th><th className="n">Us: AI cost per credit (max)</th><th className="n">Stripe fee per credit</th><th className="n">Profit per credit (worst case)</th><th className="n">Margin</th></tr></thead><tbody>
          {CREDIT_ROWS.map((r) => {
            const paid = r.price / r.credits, cost = r.ceiling / r.credits, fee = (r.price * 0.029 + 0.3) / r.credits, profit = paid - cost - fee;
            return (
              <tr key={r.name}>
                <td>{r.name}{r.note ? <><br /><span className="mute">{r.note}</span></> : null}</td>
                <td className="n">{usd2(r.price)}</td>
                <td className="n">{r.credits.toLocaleString()}</td>
                <td className="n"><b>{c4(paid)}</b></td>
                <td className="n">{c4(cost)}</td>
                <td className="n">{c4(fee)}</td>
                <td className="n" style={{ fontWeight: 700, color: profit < 0 ? "var(--bad, #c0392b)" : "var(--ok, #2e9e6b)" }}>{c4(profit)}</td>
                <td className="n">{Math.round((profit / paid) * 100)}%</td>
              </tr>
            );
          })}
          <tr><td>Free trial<br /><span className="mute">7 days, no card</span></td><td className="n">$0.00</td><td className="n">100</td><td className="n">$0.0000</td><td className="n">{c4(0.5 / 100)}</td><td className="n">$0.0000</td><td className="n" style={{ fontWeight: 700, color: "var(--bad, #c0392b)" }}>{c4(-0.5 / 100)}</td><td className="n">—</td></tr>
        </tbody></table></div>
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
