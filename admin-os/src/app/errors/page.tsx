import { Shell } from "@/components/shell";
import { Missing, Pill, Section } from "@/components/ui";
import { ago, fmt } from "@/lib/data";
import { NoKeys, load } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function Errors() {
  const r = await load();
  if (!r) return <Shell title="Errors"><NoKeys /></Shell>;
  const real = r.errors.filter((e) => e.level === "error");
  const other = r.errors.filter((e) => e.level !== "error");
  const row = (e: (typeof r.errors)[number]) => (
    <tr key={e.sig}>
      <td style={{ maxWidth: 520 }}>
        <details><summary>{e.message.slice(0, 140)}</summary>{e.route && <p className="mute" style={{ marginTop: 6 }}>Route: {e.route}</p>}{e.users.length > 0 && <p className="mute">Users: {e.users.join(", ")}</p>}{e.stack && <pre>{e.stack}</pre>}</details>
      </td>
      <td><Pill tone={e.level === "error" ? "bad" : e.level === "warn" ? "warn" : "mute"}>{e.source}</Pill></td>
      <td className="n">{e.count}</td><td className="n">{e.users.length}</td><td title={fmt(e.last)}>{ago(e.last, r.now)}</td><td>{e.open ? <Pill tone="warn">open</Pill> : <Pill tone="ok">resolved</Pill>}</td>
    </tr>
  );
  const head = <thead><tr><th>What happened</th><th>Where</th><th className="n">Times</th><th className="n">Users</th><th>Last seen</th><th>Status</th></tr></thead>;
  return (
    <Shell title="Errors" lead="The last 30 days, grouped so the same problem shows once. Click a row for details.">
      <Missing tables={r.missing.filter((m) => m === "error_logs")} />
      <Section title={`Errors (${real.length})`}><div className="tw"><table>{head}<tbody>{real.map(row)}{!real.length && <tr><td colSpan={6} className="mute">No errors. 🎉</td></tr>}</tbody></table></div></Section>
      <Section title={`Warnings and things Mila didn't understand (${other.length})`}><div className="tw"><table>{head}<tbody>{other.slice(0, 100).map(row)}{!other.length && <tr><td colSpan={6} className="mute">Nothing here.</td></tr>}</tbody></table></div></Section>
    </Shell>
  );
}
