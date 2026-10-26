import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Section } from "@/components/ui";
import { CopyText } from "@/components/creator-ui";
import { isAuthed } from "@/lib/auth";
import { HOOK_BANK, OUTREACH, RULES, SCRIPTS, VETTING } from "@/lib/creator-playbook";

export const dynamic = "force-dynamic";

export default async function Playbook() {
  if (!(await isAuthed())) redirect("/login");
  return (
    <Shell title="Scripts and outreach" lead="Everything Sarah needs to find creators, what to say to them, and the video scripts creators get on their page." right={<Link href="/creators" className="btn">← Creators</Link>}>
      <Section title="Who to look for">
        <div className="grid g2">
          <div className="card"><div className="eyebrow" style={{ color: "var(--ok)" }}>Good signs</div><ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.7, color: "var(--soft)" }}>{VETTING.good.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div className="card"><div className="eyebrow" style={{ color: "var(--bad)" }}>Red flags</div><ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.7, color: "var(--soft)" }}>{VETTING.red.map((x) => <li key={x}>{x}</li>)}</ul></div>
        </div>
      </Section>
      <Section title="What to send">
        <div className="grid" style={{ gap: 12 }}>{OUTREACH.map((o) => (
          <div key={o.id} className="card" style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}><b>{o.title}</b><span className="mute" style={{ fontSize: 13 }}>{o.when}</span></div>
            <p style={{ color: "var(--soft)", whiteSpace: "pre-wrap" }}>{o.text}</p>
            <div><CopyText text={o.text} label="Copy message" /></div>
          </div>))}</div>
      </Section>
      <Section title="The rules every video follows"><div className="card"><ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.75, color: "var(--soft)" }}>{RULES.map((r) => <li key={r}>{r}</li>)}</ol></div></Section>
      <Section title={`Video scripts (${SCRIPTS.length})`}>
        <div className="grid" style={{ gap: 12 }}>{SCRIPTS.map((s) => (
          <details key={s.id} className="card">
            <summary style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}><b>{s.title}</b><span className="mute" style={{ fontSize: 13 }}>{s.length} · {s.best}</span></summary>
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              <p className="mute">{s.why}</p>
              <div><div className="eyebrow">Hook (pick one)</div><ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>{s.hooks.map((h) => <li key={h}>{h}</li>)}</ul></div>
              <div><div className="eyebrow">Scene by scene</div>
                <div className="tw" style={{ marginTop: 6 }}><table><thead><tr><th>Time</th><th>Say</th><th>Show on screen</th></tr></thead><tbody>{s.beats.map((b) => <tr key={b.time}><td style={{ whiteSpace: "nowrap" }}>{b.time}</td><td>{b.say}</td><td className="mute">{b.show}</td></tr>)}</tbody></table></div></div>
              <div><div className="eyebrow">Caption</div><p style={{ color: "var(--soft)" }}>{s.caption}</p><div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}><CopyText text={s.caption} label="Copy caption" /><CopyText text={s.pinned} label="Copy pinned comment" /></div></div>
            </div>
          </details>))}</div>
      </Section>
      <Section title="Hook bank"><div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{HOOK_BANK.map((h) => <span key={h} className="pill">{h}</span>)}</div></Section>
    </Shell>
  );
}
