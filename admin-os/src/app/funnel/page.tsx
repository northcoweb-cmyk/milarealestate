import { Shell } from "@/components/shell";
import { Funnel, Missing, Section } from "@/components/ui";
import { NoKeys, load } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  const r = await load();
  if (!r) return <Shell title="Funnel"><NoKeys /></Shell>;
  const f = r.funnel;
  return (
    <Shell title="Funnel" lead="Did people do the thing that makes them stay, on the day it should happen?">
      <Missing tables={r.missing} />
      <Section title="Waitlist to paying"><div className="card"><Funnel steps={r.growth} /></div></Section>
      <Section title="7-day trial activation">
        <div className="card">
          <Funnel steps={[{ step: "Started a trial", n: f.started }, { step: "Day 1: first task", n: f.d1 }, { step: "Day 2: came back", n: f.d2 }, { step: "Day 3: used it unprompted", n: f.d3 }, { step: "Day 5+: still going", n: f.d5 }, { step: "Day 7: still here", n: f.d7 }, { step: "Paid", n: f.paid }]} />
          <p className="mute" style={{ marginTop: 14, fontSize: 13 }}>Days count from when each person&apos;s trial started. A step counts when they sent Mila a request or used a feature on that day (day 3 counts day 3 or 4, day 5 counts any day from 5 on, day 7 any day from 7 on). Use it to see where people drop off, then fix that step first.</p>
        </div>
      </Section>
    </Shell>
  );
}
