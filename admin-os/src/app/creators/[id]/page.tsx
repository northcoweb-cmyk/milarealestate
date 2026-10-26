import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Pill, Section, Stat } from "@/components/ui";
import { ActionButton, CopyLink, CopyText, PartnerPanel, PromotePanel, VideoReview } from "@/components/creator-ui";
import { getWho, isAuthed } from "@/lib/auth";
import { table } from "@/lib/sb";
import { PROGRAM, type Creator, type Video, activityOf, daysLeft, partnerLink, partnerVideosThisMonth, statementOf, submitUrl, verifiedCount } from "@/lib/creators";

export const dynamic = "force-dynamic";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }) : "—");
const ago = (iso: string | null) => { if (!iso) return "never"; const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const LABEL = { prospect: "On the list", invited: "Said yes", active: "Making videos", rewarded: "Free month on", partner: "Partner", paused: "Paused", expired: "Ran out of time", declined: "Declined" } as const;
const TONE = { prospect: "mute", invited: "mute", active: "warn", rewarded: "ok", partner: "ok", paused: "bad", expired: "bad", declined: "mute" } as const;

export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) redirect("/login");
  const who = await getWho(), ryan = who === "ryan";
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = (await table<Creator>("creators", { select: "*", filter: `id=eq.${id}` }))?.[0];
  if (!c) notFound();
  const videos = (await table<Video>("creator_videos", { select: "*", filter: `creator_id=eq.${id}`, order: "created_at.asc" })) ?? [];
  const act = await activityOf(c.email, c.access_at);
  const ok = verifiedCount(videos, c.id), left = daysLeft(c.deadline_at);
  const partner = c.status === "partner" || c.status === "paused";
  const ready = ok >= PROGRAM.videosNeeded && c.status === "active";
  const thisMonth = partnerVideosThisMonth(videos, c.id);
  const st = ryan && partner ? await statementOf(c) : null;
  const lowUse = c.status === "active" && act.account && act.messages < PROGRAM.partner.minUseMessages;
  return (
    <Shell title={c.name} lead={[c.handle, c.platform, c.email].filter(Boolean).join(" · ")} right={<Link href="/creators" className="btn">← All creators</Link>}>
      <div className="grid g4">
        <Stat label={partner ? "Videos this month" : "Videos verified"} value={partner ? `${thisMonth}/${c.videos_per_month}` : `${ok}/${PROGRAM.videosNeeded}`} tone={(partner ? thisMonth >= c.videos_per_month : ok >= PROGRAM.videosNeeded) ? "ok" : undefined} sub={`${videos.length} sent in all`} />
        <Stat label={partner ? "Partner since" : "Deadline"} value={partner ? fmt(c.partner_since) : c.deadline_at ? fmt(c.deadline_at) : "—"} sub={!partner && c.status === "active" && left !== null ? (left < 0 ? `${-left} days late` : `${left} days left`) : undefined} tone={!partner && c.status === "active" && left !== null && left < 0 ? "bad" : undefined} />
        <Stat label="Their Mila account" value={act.account ? "Created" : "Not yet"} sub={act.account ? `signed up ${ago(act.accountAt)}` : c.status === "active" ? "they haven't signed in" : undefined} tone={act.account ? "ok" : c.status === "active" ? "bad" : undefined} />
        <Stat label="Used Mila" value={act.messages} sub={act.account ? `messages · last ${ago(act.lastActive)}` : "messages"} tone={lowUse ? "warn" : act.messages >= PROGRAM.partner.minUseMessages ? "ok" : undefined} />
      </div>
      {lowUse && <div className="note warn" style={{ marginTop: 14 }}>They've sent Mila only {act.messages} message{act.messages === 1 ? "" : "s"}. A real video comes from real use. Nudge them before you approve anything.</div>}

      <Section title="What to do" right={<Pill tone={TONE[c.status]}>{LABEL[c.status]}</Pill>}>
        <div className="card" style={{ display: "grid", gap: 12 }}>
          {(c.status === "prospect" || c.status === "invited") && <>
            <p className="mute">{c.status === "prospect" ? "On the outreach list. Send them the first message from Scripts and outreach, then mark them contacted." : "They said yes. Granting access emails a sign-in invite and the rules and starts a " + PROGRAM.windowDays + "-day clock."}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {c.status === "prospect" && <ActionButton id={c.id} action="contacted" label="Mark contacted" />}
              <ActionButton id={c.id} action="grant_access" label="Grant access" primary confirmText={`Give ${c.name} access now? They get a sign-in email and ${PROGRAM.windowDays} days to post ${PROGRAM.videosNeeded} videos.`} />
              <ActionButton id={c.id} action="decline" label="Not a fit" confirmText="Mark as not a fit?" />
            </div></>}
          {c.status === "active" && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {ready && ryan && <ActionButton id={c.id} action="reward" label="Give the free month" primary confirmText={`Give ${c.name} ${PROGRAM.rewardDays} days of free Mila?`} extra={lowUse ? { override: true } : undefined} />}
            {ready && !ryan && <span className="pill ok">All 3 verified. Ryan gives the free month.</span>}
            <ActionButton id={c.id} action="remind" label="Send a reminder now" />
            {!act.account && <ActionButton id={c.id} action="resend_invite" label="Resend sign-in invite" />}
            {ryan && <ActionButton id={c.id} action="extend" label={`Extend ${PROGRAM.extendDays} days`} confirmText="Move their deadline back?" />}
            {ryan && <ActionButton id={c.id} action="close" label="Close (ran out of time)" confirmText="Close this creator? Their access ends when their trial does." />}
          </div>}
          {(c.status === "expired" || c.status === "declined") && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{ryan && <ActionButton id={c.id} action="extend" label={`Give ${PROGRAM.extendDays} more days`} primary />}<span className="mute">{c.closed_note}</span></div>}
          {c.status === "rewarded" && <p className="mute">Free month {fmt(c.rewarded_at)}{c.reward_ends_at ? ` to ${fmt(c.reward_ends_at)}` : " (finished)"}. Videos should stay up {PROGRAM.stayLiveDays} days.</p>}
          {partner && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><ActionButton id={c.id} action="remind" label="Remind about this month" />{ryan && c.status === "partner" && <ActionButton id={c.id} action="pause_partner" label="Pause free access" confirmText="Pause their free Mila? Their referrals and commission are kept." />}{ryan && c.status === "paused" && <ActionButton id={c.id} action="resume_partner" label="Switch access back on" primary />}</div>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><CopyLink url={submitUrl(c.token)} /><a className="btn" href={submitUrl(c.token)} target="_blank" rel="noreferrer">Open as the creator</a>{["prospect", "invited"].includes(c.status) && <ActionButton id={c.id} action="delete" label="Delete" confirmText="Delete this creator?" />}</div>
        </div>
      </Section>

      {ryan && (c.status === "rewarded" || (c.status === "active" && ok >= PROGRAM.videosNeeded)) && <Section title="Partner"><PromotePanel id={c.id} name={c.name} defaults={{ pct: PROGRAM.partner.commissionPct, months: PROGRAM.partner.commissionMonths, vpm: PROGRAM.partner.videosPerMonth }} /></Section>}
      {st && c.ref_code && <Section title="Partner numbers"><PartnerPanel id={c.id} pct={c.commission_pct} months={c.commission_months} vpm={c.videos_per_month} link={partnerLink(c.ref_code)} code={c.ref_code} st={{ ...st, referrals: st.referrals.map((r) => ({ id: r.id, email: r.email, name: r.name, plan: r.plan, paying: r.paying, paidCents: r.payments.reduce((n, x) => n + x.cents, 0) })) }} /></Section>}
      {!ryan && partner && c.ref_code && <Section title="Their code"><div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><span>Code <b>{c.ref_code}</b></span><CopyText text={partnerLink(c.ref_code)} label="Copy their sign-up link" /></div></Section>}

      <Section title={`Videos (${videos.length})`}>
        {videos.length ? <div className="grid" style={{ gap: 12 }}>{videos.map((v) => <VideoReview key={v.id} id={v.id} url={v.url} views={v.views} status={v.status} note={v.note} checks={v.checks ?? {}} flags={v.flags ?? []} kind={v.kind} />)}</div> : <div className="card mute">No links yet. They paste them on their page, and they show up here.</div>}
        {videos.length > 0 && <p className="mute" style={{ marginTop: 10, fontSize: 13 }}>Open each link, tick what you can see, and verify. Videos should reach about {PROGRAM.minViews} views to count.</p>}
      </Section>
      {c.notes && <Section title="Notes"><div className="card mute">{c.notes}</div></Section>}
    </Shell>
  );
}
