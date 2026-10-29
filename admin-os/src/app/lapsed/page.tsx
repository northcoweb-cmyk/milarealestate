import { Shell } from "@/components/shell";
import { Section, Stat } from "@/components/ui";
import { LapsedPanel } from "@/components/lapsed-panel";
import { NoKeys } from "@/lib/page";
import { isAuthed } from "@/lib/auth";
import { configured } from "@/lib/sb";
import { lapsedList } from "@/lib/lapsed";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Lapsed() {
  if (!(await isAuthed())) redirect("/login");
  if (!configured()) return <Shell title="Lapsed"><NoKeys /></Shell>;
  const { list, now } = await lapsedList();
  const open = list.filter((u) => !u.meta.hidden), optout = list.filter((u) => u.meta.optout).length;
  return (
    <Shell title="Lapsed" lead="People whose free trial ended and who never bought a plan. They stay out of the Users list, their data stays safe, and you can still reach them: pick people, write one note (a coupon, a discount, a new feature), send. Everyone gets an unsubscribe link and is never emailed after using it.">
      <div className="grid g4"><Stat label="Lapsed" value={list.length} /><Stat label="Reachable" value={list.filter((u) => !u.meta.optout).length} /><Stat label="Already emailed" value={list.filter((u) => u.meta.emailed?.length).length} /><Stat label="Unsubscribed" value={optout} /></div>
      <Section title="Win them back"><LapsedPanel rows={list.map((u) => ({ id: u.id, email: u.email, name: u.name, ended: u.ended, last: u.last, turns: u.turns, emailed: u.meta.emailed?.length ?? 0, lastEmail: u.meta.emailed?.at(-1)?.at ?? null, hidden: !!u.meta.hidden, optout: !!u.meta.optout }))} now={now} openCount={open.length} />
      </Section>
    </Shell>
  );
}
