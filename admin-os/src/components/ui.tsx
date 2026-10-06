import Link from "next/link";

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "ok" | "warn" | "bad" }) {
  return <div className={`card stat ${tone ?? ""}`}><p className="eyebrow">{label}</p><p className="num">{value}</p>{sub && <p className="sub">{sub}</p>}</div>;
}
export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return <section className="sec"><div className="sec-h"><h2>{title}</h2>{right}</div>{children}</section>;
}
export function Bars({ data, fmt = (n: number) => String(n), height = 96 }: { data: { day: string; n: number }[]; fmt?: (n: number) => string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const w = 100 / data.length;
  return (
    <div className="chart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label="Chart">
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2="100" y1={height * g} y2={height * g} className="grid" vectorEffect="non-scaling-stroke" />)}
        {data.map((d, i) => { const h = (d.n / max) * (height - 6); return <rect key={d.day} x={i * w + w * 0.15} width={w * 0.7} y={height - h} height={Math.max(h, d.n ? 1.5 : 0)} rx="0.6" className={i === data.length - 1 ? "bar last" : "bar"}><title>{`${d.day}: ${fmt(d.n)}`}</title></rect>; })}
      </svg>
      <div className="axis"><span>{data[0]?.day.slice(5)}</span><span>peak {fmt(max)}</span><span>{data[data.length - 1]?.day.slice(5)}</span></div>
    </div>
  );
}
export function Funnel({ steps }: { steps: { step: string; n: number }[] }) {
  const top = Math.max(1, steps[0]?.n ?? 1);
  return (
    <div className="funnel">
      {steps.map((s, i) => (
        <div key={s.step} className="frow">
          <span className="fl">{s.step}</span>
          <span className="fb"><i style={{ width: `${Math.max(2, (s.n / top) * 100)}%` }} /></span>
          <span className="fn">{s.n}{i > 0 && steps[i - 1].n > 0 ? <em> {Math.round((s.n / steps[i - 1].n) * 100)}%</em> : null}</span>
        </div>
      ))}
    </div>
  );
}
export function Pill({ children, tone }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" | "mute" }) { return <span className={`pill ${tone ?? "mute"}`}>{children}</span>; }
export function Missing({ tables }: { tables: string[] }) {
  if (!tables.length) return null;
  return <div className="note warn">Couldn&apos;t read: <b>{tables.join(", ")}</b>. {tables.includes("waitlist") ? "Run supabase/migrations/0005_waitlist.sql in the Supabase SQL editor to create the waitlist table. " : ""}Other missing tables mean the keys on this project are wrong or a migration hasn&apos;t been run.</div>;
}
