import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Pill, Section, Stat } from "@/components/ui";
import { ActionButton, CopyLink, VideoReview } from "@/components/creator-ui";
import { isAuthed } from "@/lib/auth";
import { table } from "@/lib/sb";
import { PROGRAM, type Creator, type Video, daysLeft, profileOf, submitUrl, verifiedCount } from "@/lib/creators";

export const dynamic = "force-dynamic";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }) : "—");

export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) redirect("/login");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = (await table<Creator>("creators", { select: "*", filter: `id=eq.${id}` }))?.[0];
  if (!c) notFound();
  const videos = (await table<Video>("creator_videos", { select: "*", filter: `creator_id=eq.${id}`, order: "created_at.asc" })) ?? [];
  const account = await profileOf(c.email);
  const ok = verifiedCount(videos, c.id), left = daysLeft(c.deadline_at);
  const ready = ok >= PROGRAM.videosNeeded && c.status === "active";
  return (
    <Shell title={c.name} lead={[c.handle, c.platform, c.email].filter(Boolean).join(" · ")} right={<Link href="/creators" className="btn">← All creators</Link>}>
      <div className="grid g4">
        <Stat label="Videos verified" value={`${ok}/${PROGRAM.videosNeeded}`} tone={ok >= PROGRAM.videosNeeded ? "ok" : undefined} sub={`${videos.length} sent`} />
        <Stat label="Deadline" value={c.deadline_at ? fmt(c.deadline_at) : "—"} sub={c.status === "active" && left !== null ? (left < 0 ? `${-left} days late` : `${left} days left`) : undefined} tone={c.status === "active" && left !== null && left < 0 ? "bad" : undefined} />
        <Stat label="Their Mila account" value={account ? "Created" : "Not yet"} sub={account ? undefined : "they sign in from the invite email"} tone={account ? "ok" : "warn"} />
        <Stat label="Reminders sent" value={c.reminders_sent} sub={c.last_reminded_at ? `last ${fmt(c.last_reminded_at)}` : undefined} />
      </div>

      <Section title="What to do" right={<Pill tone={c.status === "rewarded" ? "ok" : c.status === "active" ? "warn" : c.status === "invited" ? "mute" : "bad"}>{({ invited: "Not started", active: "Making videos", rewarded: "Free month on", expired: "Ran out of time", declined: "Declined" } as const)[c.status]}</Pill>}>
        <div className="card" style={{ display: "grid", gap: 12 }}>
          {c.status === "invited" && <><p className="mute">Granting access emails them a sign-in invite and the rules, and starts a {PROGRAM.windowDays}-day clock.</p><div><ActionButton id={c.id} action="grant_access" label="Grant access" primary confirmText={`Give ${c.name} access now? They get a sign-in email and ${PROGRAM.windowDays} days to post ${PROGRAM.videosNeeded} videos.`} /></div></>}
          {c.status === "active" && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {ready && <ActionButton id={c.id} action="reward" label={`Give the free month`} primary confirmText={`Give ${c.name} ${PROGRAM.rewardDays} days of free Mila?`} />}
            <ActionButton id={c.id} action="remind" label="Send a reminder now" />
            <ActionButton id={c.id} action="extend" label={`Extend ${PROGRAM.extendDays} days`} confirmText="Move their deadline back?" />
            <ActionButton id={c.id} action="close" label="Close (ran out of time)" confirmText="Close this creator? Their access ends when their trial does." />
          </div>}
          {(c.status === "expired" || c.status === "declined") && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><ActionButton id={c.id} action="extend" label={`Give ${PROGRAM.extendDays} more days`} primary /><span className="mute">{c.closed_note}</span></div>}
          {c.status === "rewarded" && <p className="mute">Free month {fmt(c.rewarded_at)}{c.reward_ends_at ? ` to ${fmt(c.reward_ends_at)}` : " (finished)"}. Videos should stay up {PROGRAM.stayLiveDays} days.</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><CopyLink url={submitUrl(c.token)} /><a className="btn" href={submitUrl(c.token)} target="_blank" rel="noreferrer">Open as the creator</a>{c.status === "invited" && <ActionButton id={c.id} action="delete" label="Delete" confirmText="Delete this creator?" />}</div>
        </div>
      </Section>

      <Section title={`Videos (${videos.length})`}>
        {videos.length ? <div className="grid" style={{ gap: 12 }}>{videos.map((v) => <VideoReview key={v.id} id={v.id} url={v.url} views={v.views} status={v.status} note={v.note} checks={v.checks ?? {}} />)}</div> : <div className="card mute">No links yet. They paste them on their page, and they show up here.</div>}
        {videos.length > 0 && <p className="mute" style={{ marginTop: 10, fontSize: 13 }}>Open each link, tick what you can see, and verify. Videos should reach about {PROGRAM.minViews} views to count.</p>}
      </Section>
      {c.notes && <Section title="Notes"><div className="card mute">{c.notes}</div></Section>}
    </Shell>
  );
}
