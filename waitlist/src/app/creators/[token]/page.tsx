import { notFound } from "next/navigation";
import { creatorByToken, creatorVideos, partnerNumbers } from "@/lib/sb";
import { HOOK_BANK, RULES, SCRIPTS } from "@/lib/creator-playbook";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Mila creator page", robots: { index: false, follow: false } };

const NEEDED = 3;
const STATUS = { submitted: ["Being checked", "#8a6d00", "#fff6d6"], verified: ["Approved", "#0a7d4f", "#dff7ea"], changes: ["Needs a small fix", "#b45309", "#ffedd5"], rejected: ["Not accepted", "#b91c1c", "#fee2e2"] } as const;
const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
const monthOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).format(new Date(iso));
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const APP = (process.env.NEXT_PUBLIC_APP_URL || "https://app.milarealestate.app").replace(/\/+$/, "");

export default async function CreatorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await creatorByToken(token);
  if (!c) notFound();
  const videos = await creatorVideos(c.id);
  const partner = c.status === "partner" || c.status === "paused";
  const open = c.status === "active" || partner;
  const thisMonth = videos.filter((v) => v.kind === "partner" && v.status === "verified" && v.verified_at && monthOf(v.verified_at) === monthOf(new Date().toISOString())).length;
  const ok = videos.filter((v) => v.kind !== "partner" && v.status === "verified").length;
  const left = c.deadline_at ? Math.ceil((new Date(c.deadline_at).getTime() - Date.now()) / 86_400_000) : null;
  const nums = partner ? await partnerNumbers(c) : null;
  const first = c.name.split(/\s+/)[0];
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="display text-4xl">Mila</p>
      <p className="mt-1 text-[13px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{partner ? "Partner" : "Creator partner"}</p>
      <h1 className="display mt-6 text-5xl">Hi {first}.</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-foreground/80">
        {c.status === "paused" ? "Your partner month was missed, so your free Mila is paused. Post your videos below and we'll switch it back on." : partner ? `You're a Mila partner. Post ${c.videos_per_month} video${c.videos_per_month === 1 ? "" : "s"} a month to keep Mila free, and you earn ${c.commission_pct}% of what your referrals pay.` : c.status === "rewarded" ? "You did it. Your free month of Mila is on. Thank you!" : c.status === "active" ? `Post ${NEEDED} videos showing Mila in action and you get a free month.` : c.status === "invited" || c.status === "prospect" ? "Your access hasn't started yet. We'll email you the moment it does." : "Your creator window has closed. Reply to the email we sent and we'll look at reopening it."}
      </p>

      {c.status === "active" && c.deadline_at && (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-3xl border border-border bg-white p-5">
          <div><p className="text-[12px] font-bold uppercase tracking-[.14em] text-muted-foreground">Due</p><p className="display mt-1 text-3xl">{fmt(c.deadline_at)}</p></div>
          <div className="text-right"><p className="display text-4xl" style={{ color: left !== null && left <= 2 ? "#b45309" : undefined }}>{ok}/{NEEDED}</p><p className="text-[13px] text-muted-foreground">{left !== null && left >= 0 ? `${left} day${left === 1 ? "" : "s"} left` : "past due"}</p></div>
        </div>
      )}

      {partner && nums && c.ref_code && (
        <div className="mt-6 rounded-3xl border border-border bg-white p-5">
          <div className="flex items-center justify-between gap-4"><div><p className="text-[12px] font-bold uppercase tracking-[.14em] text-muted-foreground">This month</p><p className="display mt-1 text-4xl">{thisMonth}/{c.videos_per_month} <span className="text-[16px] text-muted-foreground">videos</span></p></div>
            <div className="text-right"><p className="text-[12px] font-bold uppercase tracking-[.14em] text-muted-foreground">Earned so far</p><p className="display mt-1 text-4xl">{usd(nums.earnedCents)}</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-[15px]"><div className="rounded-2xl bg-secondary p-3"><b className="text-[22px]">{nums.signups}</b><br /><span className="text-muted-foreground">signed up with your link</span></div><div className="rounded-2xl bg-secondary p-3"><b className="text-[22px]">{nums.paying}</b><br /><span className="text-muted-foreground">paying customers</span></div></div>
          <p className="mt-4 text-[13px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Your link</p>
          <p className="mt-1 break-all rounded-2xl bg-secondary p-3 text-[14.5px] select-all">{APP}/welcome?ref={c.ref_code}</p>
          <p className="mt-2 text-[13px] text-muted-foreground">Put this link in your bio and videos. You earn {c.commission_pct}% of each payment for {c.commission_months} months per person. Earnings are an estimate; we pay monthly.</p>
        </div>
      )}

      {open && <>
        <h2 className="mt-10 text-[20px] font-semibold tracking-tight">Send a video</h2>
        <p className="mb-3 mt-1 text-[15px] text-muted-foreground">Post it first, then paste the link here. Every link is checked by a person.</p>
        <SubmitForm token={token} />
      </>}

      {videos.length > 0 && <>
        <h2 className="mt-10 text-[20px] font-semibold tracking-tight">Your videos</h2>
        <ul className="mt-3 space-y-3">{videos.map((v) => { const [label, color, bg] = STATUS[v.status]; return (
          <li key={v.id} className="rounded-2xl border border-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><a href={v.url} target="_blank" rel="noreferrer" className="min-w-0 break-all text-[14.5px] underline">{v.url.replace(/^https:\/\/(www\.)?/, "")}</a><span className="rounded-full px-3 py-1 text-[12.5px] font-bold" style={{ color, background: bg }}>{label}</span></div>
            {v.status === "changes" && <div className="mt-3"><p className="mb-2 rounded-xl bg-orange-50 p-3 text-[14.5px] text-orange-900">{v.note ?? "Please check the checklist below."}</p>{open && <SubmitForm token={token} replace={v.id} label="Send the fixed link" />}</div>}
          </li>); })}</ul>
      </>}

      <h2 className="mt-10 text-[20px] font-semibold tracking-tight">Ready-to-film scripts</h2>
      <p className="mb-3 mt-1 text-[15px] text-muted-foreground">Pick one, film it on your phone in a couple of takes. They're built to be watched, not to look like an ad.</p>
      <div className="space-y-3">{SCRIPTS.map((s) => (
        <details key={s.id} className="rounded-2xl border border-border bg-white p-4">
          <summary className="cursor-pointer list-none"><span className="font-semibold">{s.title}</span><span className="ml-2 text-[13px] text-muted-foreground">{s.length} · {s.best}</span></summary>
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed">
            <p className="text-muted-foreground">{s.why}</p>
            <div><p className="text-[12px] font-bold uppercase tracking-[.12em] text-muted-foreground">Open with one of these</p><ul className="mt-1 list-disc pl-5">{s.hooks.map((h) => <li key={h}>{h}</li>)}</ul></div>
            <div><p className="text-[12px] font-bold uppercase tracking-[.12em] text-muted-foreground">Scene by scene</p><ol className="mt-1 space-y-2">{s.beats.map((b) => <li key={b.time} className="rounded-xl bg-secondary p-3"><b>{b.time}</b> · {b.say}<br /><span className="text-muted-foreground">Show: {b.show}</span></li>)}</ol></div>
            <div><p className="text-[12px] font-bold uppercase tracking-[.12em] text-muted-foreground">Caption</p><p className="mt-1 select-all rounded-xl bg-secondary p-3">{s.caption}</p><p className="mt-2 text-[12px] font-bold uppercase tracking-[.12em] text-muted-foreground">Pinned comment</p><p className="mt-1 select-all rounded-xl bg-secondary p-3">{s.pinned}</p></div>
          </div>
        </details>))}</div>

      <h2 className="mt-10 text-[20px] font-semibold tracking-tight">The checklist</h2>
      <ul className="mt-3 space-y-2.5 text-[16px] leading-snug">{RULES.map((t) => <li key={t} className="flex gap-3"><span aria-hidden className="mt-0.5 text-[18px]">✓</span><span>{t}</span></li>)}</ul>
      <div className="mt-8 rounded-3xl p-5 text-[15px] leading-relaxed text-foreground/80" style={{ background: "#f1effa" }}>
        <b>Hooks that work:</b> {HOOK_BANK.map((h) => `"${h}"`).join(" · ")}
      </div>
      <p className="mt-10 text-[13px] text-muted-foreground">Questions? Open Help &amp; support inside Mila. This page is private to you, so please don&apos;t share the link. Videos should stay up for 30 days after you earn your free month.</p>
    </main>
  );
}
