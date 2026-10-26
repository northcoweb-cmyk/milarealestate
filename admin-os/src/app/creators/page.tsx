import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Pill, Section, Stat } from "@/components/ui";
import { AddCreator } from "@/components/creator-ui";
import { isAuthed } from "@/lib/auth";
import { configured } from "@/lib/sb";
import { PROGRAM, attention, daysLeft, loadAll, verifiedCount, type Creator } from "@/lib/creators";

export const dynamic = "force-dynamic";

const STATUS: Record<Creator["status"], { label: string; tone: "ok" | "warn" | "bad" | "mute" }> = { invited: { label: "Not started", tone: "mute" }, active: { label: "Making videos", tone: "warn" }, rewarded: { label: "Free month on", tone: "ok" }, expired: { label: "Ran out of time", tone: "bad" }, declined: { label: "Declined", tone: "mute" } };

function Dots({ done, waiting }: { done: number; waiting: number }) {
  return <span style={{ display: "inline-flex", gap: 5, verticalAlign: "middle" }} aria-label={`${done} of ${PROGRAM.videosNeeded} videos verified`}>{Array.from({ length: PROGRAM.videosNeeded }, (_, i) => <i key={i} style={{ width: 12, height: 12, borderRadius: 99, background: i < done ? "var(--ok)" : i < done + waiting ? "var(--warn)" : "transparent", border: `1.5px solid ${i < done ? "var(--ok)" : i < done + waiting ? "var(--warn)" : "var(--line)"}` }} />)}</span>;
}

export default async function Creators() {
  if (!(await isAuthed())) redirect("/login");
  const data = configured() ? await loadAll() : null;
  const creators = data?.creators ?? [], videos = data?.videos ?? [];
  const todo = attention(creators, videos);
  const count = (s: Creator["status"]) => creators.filter((c) => c.status === s).length;
  return (
    <Shell title="Creators" lead={`Give a creator access, they post ${PROGRAM.videosNeeded} videos in ${PROGRAM.windowDays} days, you check them, and they earn ${PROGRAM.rewardDays} days of Mila free.`} right={<AddCreator />}>
      {!data && <div className="note warn">Couldn&apos;t read creators. Run <b>0014_creators.sql</b> in the Supabase SQL editor, then refresh.</div>}
      {data && <>
        <div className="grid g4">
          <Stat label="Making videos" value={count("active")} sub="inside their window" tone={count("active") ? "warn" : undefined} />
          <Stat label="Waiting on you" value={todo.filter((t) => t.kind === "review" || t.kind === "reward").length} sub="to check or reward" tone={todo.some((t) => t.kind === "review" || t.kind === "reward") ? "bad" : undefined} />
          <Stat label="Earned a free month" value={count("rewarded")} tone="ok" />
          <Stat label="Videos verified" value={videos.filter((v) => v.status === "verified").length} sub={`${videos.length} submitted`} />
        </div>
        <Section title="Needs you now">
          {todo.length ? <div className="grid" style={{ gap: 10 }}>{todo.map((t) => (
            <Link key={t.creator.id + t.kind} href={`/creators/${t.creator.id}`} className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span><b>{t.creator.name}</b> <span className="mute">{t.text}</span></span>
              <Pill tone={t.kind === "reward" ? "ok" : t.kind === "review" ? "warn" : t.kind === "overdue" ? "bad" : "mute"}>{t.kind === "reward" ? "Give the free month" : t.kind === "review" ? "Check videos" : t.kind === "overdue" ? "Past due" : "Due soon"}</Pill>
            </Link>))}</div> : <div className="card mute">Nothing is waiting on you.</div>}
        </Section>
        <Section title={`Everyone (${creators.length})`}>
          {creators.length ? <div className="grid" style={{ gap: 10 }}>{creators.map((c) => {
            const vs = videos.filter((v) => v.creator_id === c.id), left = daysLeft(c.deadline_at);
            return (
              <Link key={c.id} href={`/creators/${c.id}`} className="card" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) auto auto", gap: "6px 18px", alignItems: "center" }}>
                <div style={{ minWidth: 0 }}><b>{c.name}</b><div className="mute" style={{ fontSize: 13 }}>{[c.handle, c.platform, c.followers ? `${c.followers.toLocaleString()} followers` : null].filter(Boolean).join(" · ") || c.email}</div></div>
                <div style={{ display: "grid", gap: 4, justifyItems: "start" }}><Dots done={verifiedCount(videos, c.id)} waiting={vs.filter((v) => v.status === "submitted").length} /><span className="mute" style={{ fontSize: 12.5 }}>{c.status === "active" && left !== null ? (left < 0 ? `${-left}d late` : left === 0 ? "due today" : `${left}d left`) : c.access_at ? `since ${new Date(c.access_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "not started"}</span></div>
                <Pill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Pill>
              </Link>
            );
          })}</div> : <div className="card mute">No creators yet. Add the first one with the button above.</div>}
        </Section>
        <Section title="The rules creators see"><div className="card"><ol style={{ margin: 0, paddingLeft: 20, color: "var(--soft)", lineHeight: 1.75 }}>
          <li>Access starts when you press <b>Grant access</b>. They have <b>{PROGRAM.windowDays} days</b> to post <b>{PROGRAM.videosNeeded} videos</b>; Mila stays on for the whole window.</li>
          <li>Reminders email them automatically on day {PROGRAM.remindOnDay.join(", ")}. If the window closes short of {PROGRAM.videosNeeded}, access ends and they can ask for one extension.</li>
          <li>Each video must show the real app, say {PROGRAM.hashtags.join(" + ")}, tag Mila, and make no income claims. You tick four checks per video.</li>
          <li>The free month ({PROGRAM.rewardCredits.toLocaleString()} credits, {PROGRAM.rewardDays} days) is only given <b>after</b> all {PROGRAM.videosNeeded} are verified, so nobody gets a free month for nothing.</li>
          <li>Videos stay up {PROGRAM.stayLiveDays} days. When the free month ends the plan ends too (their data stays visible) and they get an email to keep going.</li>
        </ol></div></Section>
      </>}
    </Shell>
  );
}
