import { Shell } from "@/components/shell";
import { Checklist } from "@/components/checklist";
import { TopupButton } from "@/components/topup-button";
import { ExtendTrial, GrantCredits } from "@/components/admin-actions";
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
  const date = process.env.LAUNCH_DATE || "2026-10-23";
  return (
    <Shell title="Launch" lead={`Release date ${date}. If an item isn't done, the date moves.`}>
      <Section title="Live app checks">
        <div className="tw"><table><thead><tr><th>Check</th><th>Status</th><th className="n">Time</th></tr></thead><tbody>
          {checks.map((c) => <tr key={c.name}><td>{c.name}<br /><span className="mute">{c.url}</span></td><td><Pill tone={c.ok ? "ok" : "bad"}>{c.ok ? `Up (${c.status})` : c.status ? `Problem (${c.status})` : "Not reachable"}</Pill></td><td className="n">{c.ms} ms</td></tr>)}
        </tbody></table></div>
      </Section>
      <Section title="Top-ups to remember">
        <div className="card"><ul style={{ margin: 0, paddingLeft: 20, color: "var(--soft)", lineHeight: 1.8 }}>
          <li><b>AI provider (OpenAI):</b> add prepaid credit before launch, turn on auto-recharge if offered, and set a monthly spend limit you can live with. Watch Cost per day on the AI spend page.</li>
          <li><b>RentCast (property data):</b> check the plan's monthly request allowance covers 25 users, and top it up. Every pull is billed to the user in credits, so heavy use pays for itself.</li>
          <li><b>Google Cloud:</b> billing active, the budget alert set, and the Maps key restricted. Street View and geocoding are billed per call.</li>
          <li><b>Resend (support email):</b> the free plan has daily and monthly sending limits. Upgrade it if you expect more than a few replies a day.</li>
          <li><b>Supabase and Vercel:</b> check the plan limits (database size, bandwidth, function time) on launch morning.</li>
          <li><b>Voice:</b> speech is metered in credits; check the AI provider balance covers it.</li>
        </ul><p className="mute" style={{ marginTop: 10, fontSize: 13 }}>The in-app daily AI cap (<b>MILA_DAILY_AI_BUDGET_USD</b>, default $40) and the free-trial pool ($20) stop a runaway before it drains an account.</p></div>
      </Section>
      <Section title="Before testing"><TopupButton /></Section>
      <Section title="Grant credits (audited)"><GrantCredits /></Section>
      <Section title="Extend a free trial (audited)"><ExtendTrial /></Section>
      <Section title="Go / no-go checklist"><Checklist /></Section>
    </Shell>
  );
}
