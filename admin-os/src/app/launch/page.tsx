import { Shell } from "@/components/shell";
import { Checklist } from "@/components/checklist";
import { Pill, Section } from "@/components/ui";
import { isAuthed } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function ping(url: string) {
  const t = Date.now();
  try { const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000), redirect: "manual" }); return { ok: r.status < 400 || r.status === 307 || r.status === 308, status: r.status, ms: Date.now() - t }; }
  catch { return { ok: false, status: 0, ms: Date.now() - t }; }
}

export default async function Launch() {
  if (!(await isAuthed())) redirect("/login");
  const app = (process.env.MILA_APP_URL || "https://milarealestate.vercel.app").replace(/\/+$/, "");
  const checks = await Promise.all([["Welcome page", `${app}/welcome`], ["App health", `${app}/api/health`]].map(async ([name, url]) => ({ name, url, ...(await ping(url)) })));
  const date = process.env.LAUNCH_DATE || "2026-10-20";
  return (
    <Shell title="Launch" lead={`Release date ${date}. If an item isn't done, the date moves.`}>
      <Section title="Live app checks">
        <div className="tw"><table><thead><tr><th>Check</th><th>Status</th><th className="n">Time</th></tr></thead><tbody>
          {checks.map((c) => <tr key={c.name}><td>{c.name}<br /><span className="mute">{c.url}</span></td><td><Pill tone={c.ok ? "ok" : "bad"}>{c.ok ? `Up (${c.status})` : c.status ? `Problem (${c.status})` : "Not reachable"}</Pill></td><td className="n">{c.ms} ms</td></tr>)}
        </tbody></table></div>
      </Section>
      <Section title="Go / no-go checklist"><Checklist /></Section>
    </Shell>
  );
}
