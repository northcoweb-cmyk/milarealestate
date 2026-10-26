import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Pill, Section, Stat } from "@/components/ui";
import { AddCreator } from "@/components/creator-ui";
import { getWho, isAuthed } from "@/lib/auth";
import { configured } from "@/lib/sb";
import { PROGRAM, attention, daysLeft, loadAll, partnerVideosThisMonth, statementOf, verifiedCount, type Creator, type Statement } from "@/lib/creators";

export const dynamic = "force-dynamic";

const STATUS: Record<Creator["status"], { label: string; tone: "ok" | "warn" | "bad" | "mute" }> = {
  prospect: { label: "On the list", tone: "mute" }, invited: { label: "Said yes", tone: "mute" }, active: { label: "Making videos", tone: "warn" }, rewarded: { label: "Free month on", tone: "ok" },
  partner: { label: "Partner", tone: "ok" }, paused: { label: "Paused", tone: "bad" }, expired: { label: "Ran out of time", tone: "bad" }, declined: { label: "Declined", tone: "mute" },
};
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

function Dots({ done, waiting, of = PROGRAM.videosNeeded }: { done: number; waiting: number; of?: number }) {
  return <span style={{ display: "inline-flex", gap: 5, verticalAlign: "middle" }} aria-label={`${done} of ${of} videos verified`}>{Array.from({ length: of }, (_, i) => <i key={i} style={{ width: 12, height: 12, borderRadius: 99, background: i < done ? "var(--ok)" : i < done + waiting ? "var(--warn)" : "transparent", border: `1.5px solid ${i < done ? "var(--ok)" : i < done + waiting ? "var(--warn)" : "var(--line)"}` }} />)}</span>;
}

function Row({ c, videos, when }: { c: Creator; videos: Awaited<ReturnType<typeof loadAll>> extends infer T ? (T extends { videos: infer V } ? V : never) : never; when: string }) {
  const vs = videos.filter((v) => v.creator_id === c.id), partner = c.status === "partner" || c.status === "paused";
  const done = partner ? partnerVideosThisMonth(videos, c.id) : verifiedCount(videos, c.id);
  return (
    <Link href={`/creators/${c.id}`} className="card" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) auto auto", gap: "6px 18px", alignItems: "center" }}>
      <div style={{ minWidth: 0 }}><b>{c.name}</b><div className="mute" style={{ fontSize: 13 }}>{[c.handle, c.platform, c.followers ? `${c.followers.toLocaleString()} followers` : null].filter(Boolean).join(" · ") || c.email}</div></div>
      <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>{["prospect", "invited"].includes(c.status) ? <span className="mute" style={{ fontSize: 12.5 }}>{c.contacted_at ? "contacted" : "not contacted yet"}</span> : <><Dots done={done} waiting={vs.filter((v) => v.status === "submitted").length} of={partner ? c.videos_per_month : PROGRAM.videosNeeded} /><span className="mute" style={{ fontSize: 12.5 }}>{when}</span></>}</div>
      <Pill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Pill>
    </Link>
  );
}

export default async function Creators() {
  if (!(await isAuthed())) redirect("/login");
  const who = await getWho();
  const data = configured() ? await loadAll() : null;
  const creators = data?.creators ?? [], videos = data?.videos ?? [];
  const todo = attention(creators, videos);
  const by = (...s: Creator["status"][]) => creators.filter((c) => s.includes(c.status));
  const partners = by("partner", "paused");
  const statements = new Map<string, Statement>();
  if (who === "ryan") for (const p of partners) statements.set(p.id, await statementOf(p));
  const owed = [...statements.values()].reduce((n, s) => n + s.owedCents, 0);
  const whenOf = (c: Creator) => { const left = daysLeft(c.deadline_at); return c.status === "active" && left !== null ? (left < 0 ? `${-left}d late` : left === 0 ? "due today" : `${left}d left`) : c.status === "partner" || c.status === "paused" ? "this month" : c.access_at ? `since ${new Date(c.access_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""; };
  const group = (title: string, list: Creator[], empty: string, right?: React.ReactNode) => (
    <Section title={`${title} (${list.length})`} right={right}>{list.length ? <div className="grid" style={{ gap: 10 }}>{list.map((c) => <Row key={c.id} c={c} videos={videos} when={whenOf(c)} />)}</div> : <div className="card mute">{empty}</div>}</Section>
  );
  return (
    <Shell title="Creators" lead={`Find a creator, give access, they post ${PROGRAM.videosNeeded} videos in ${PROGRAM.windowDays} days, you check them, and they earn ${PROGRAM.rewardDays} days of Mila free. The best become partners.`} right={<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link href="/creators/playbook" className="btn">Scripts and outreach</Link><AddCreator /></div>}>
      {!data && <div className="note warn">Couldn&apos;t read creators. Run <b>0014_creators.sql</b> and <b>0015_creator_partners.sql</b> in the Supabase SQL editor, then refresh.</div>}
      {data && <>
        <div className="grid g4">
          <Stat label="Waiting on you" value={todo.filter((t) => t.kind === "review" || t.kind === "reward").length} sub="to check or reward" tone={todo.some((t) => t.kind === "review" || t.kind === "reward") ? "bad" : undefined} />
          <Stat label="Making videos" value={by("active").length} sub={`of ${PROGRAM.maxActive} spots`} tone={by("active").length ? "warn" : undefined} />
          <Stat label="Partners" value={partners.filter((p) => p.status === "partner").length} sub={partners.some((p) => p.status === "paused") ? `${partners.filter((p) => p.status === "paused").length} paused` : "posting monthly"} tone="ok" />
          <Stat label={who === "ryan" ? "Commission owed" : "Videos verified"} value={who === "ryan" ? usd(owed) : videos.filter((v) => v.status === "verified").length} sub={who === "ryan" ? "to partners, estimated" : `${videos.length} sent`} />
        </div>
        <Section title="Needs you now">
          {todo.length ? <div className="grid" style={{ gap: 10 }}>{todo.filter((t) => who === "ryan" || t.kind !== "reward").map((t) => (
            <Link key={t.creator.id + t.kind} href={`/creators/${t.creator.id}`} className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span><b>{t.creator.name}</b> <span className="mute">{t.text}</span></span>
              <Pill tone={t.kind === "reward" ? "ok" : t.kind === "review" ? "warn" : t.kind === "overdue" ? "bad" : "mute"}>{t.kind === "reward" ? "Give the free month" : t.kind === "review" ? "Check videos" : t.kind === "overdue" ? "Past due" : "Due soon"}</Pill>
            </Link>))}</div> : <div className="card mute">Nothing is waiting on you.</div>}
        </Section>
        {group("Outreach", by("prospect", "invited"), "Nobody on the list yet. Add people you find, then message them with the scripts.")}
        {group("In their window", by("active"), "Nobody has access right now.")}
        {group("Partners", partners, "No partners yet. A creator who did well gets promoted from their page.", who === "ryan" && partners.length ? <span className="mute">Estimated commission owed {usd(owed)}</span> : undefined)}
        {group("Finished", by("rewarded", "expired", "declined"), "Nobody yet.")}
        <Section title="Sarah's daily routine"><div className="card"><ol style={{ margin: 0, paddingLeft: 20, color: "var(--soft)", lineHeight: 1.8 }}>
          <li>Open <b>Needs you now</b>: check every new video link (open it, tick the four boxes, add the views). Heed any warning shown.</li>
          <li>Look at <b>In their window</b>: anyone with 3 days or less, or zero messages in Mila, gets a reminder or a personal DM.</li>
          <li>Send 10 outreach messages from <Link href="/creators/playbook" style={{ textDecoration: "underline" }}>Scripts and outreach</Link>. Add everyone who answers, mark <b>Contacted</b>.</li>
          <li>When someone says yes, add their email and handle and press <b>Grant access</b> (max {PROGRAM.maxActive} in a window at once).</li>
          <li>Anything about money (the free month, partners, payouts) goes to Ryan. He sees it on his list.</li>
        </ol></div></Section>
        <Section title="The rules creators see"><div className="card"><ol style={{ margin: 0, paddingLeft: 20, color: "var(--soft)", lineHeight: 1.75 }}>
          <li>Access starts when someone presses <b>Grant access</b>. They have <b>{PROGRAM.windowDays} days</b> to post <b>{PROGRAM.videosNeeded} videos</b>.</li>
          <li>If they haven&apos;t signed in by day 2, or haven&apos;t used Mila by day 4, they get a nudge. Reminders on day {PROGRAM.remindOnDay.join(", ")}. Short of {PROGRAM.videosNeeded} when the window closes: access ends.</li>
          <li>Each video must show the real app, say {PROGRAM.hashtags.join(" + ")}, tag Mila, and make no income claims.</li>
          <li>The free month is only given <b>after</b> all {PROGRAM.videosNeeded} are verified and they have really used Mila ({PROGRAM.partner.minUseMessages}+ messages).</li>
          <li>Partners: free Mila while they post {PROGRAM.partner.videosPerMonth} videos a month, plus {PROGRAM.partner.commissionPct}% of every payment from people they refer, for {PROGRAM.partner.commissionMonths} months each.</li>
        </ol></div></Section>
      </>}
    </Shell>
  );
}
