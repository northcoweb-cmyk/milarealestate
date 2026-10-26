import { notFound } from "next/navigation";
import { creatorByToken, creatorVideos } from "@/lib/sb";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Mila creator page", robots: { index: false, follow: false } };

const NEEDED = 3;
const STATUS = { submitted: ["Being checked", "#8a6d00", "#fff6d6"], verified: ["Approved", "#0a7d4f", "#dff7ea"], changes: ["Needs a small fix", "#b45309", "#ffedd5"], rejected: ["Not accepted", "#b91c1c", "#fee2e2"] } as const;
const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));

export default async function CreatorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await creatorByToken(token);
  if (!c) notFound();
  const videos = await creatorVideos(c.id);
  const ok = videos.filter((v) => v.status === "verified").length;
  const left = c.deadline_at ? Math.ceil((new Date(c.deadline_at).getTime() - Date.now()) / 86_400_000) : null;
  const first = c.name.split(/\s+/)[0];
  const open = c.status === "active";
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="display text-4xl">Mila</p>
      <p className="mt-1 text-[13px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Creator partner</p>
      <h1 className="display mt-6 text-5xl">Hi {first}.</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-foreground/80">
        {c.status === "rewarded" ? "You did it. Your free month of Mila is on. Thank you!" : c.status === "active" ? `Post ${NEEDED} videos showing Mila in action and you get a free month.` : c.status === "invited" ? "Your access hasn't started yet. We'll email you the moment it does." : "Your creator window has closed. Reply to the email we sent and we'll look at reopening it."}
      </p>

      {open && c.deadline_at && (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-3xl border border-border bg-white p-5">
          <div><p className="text-[12px] font-bold uppercase tracking-[.14em] text-muted-foreground">Due</p><p className="display mt-1 text-3xl">{fmt(c.deadline_at)}</p></div>
          <div className="text-right"><p className="display text-4xl" style={{ color: left !== null && left <= 2 ? "#b45309" : undefined }}>{ok}/{NEEDED}</p><p className="text-[13px] text-muted-foreground">{left !== null && left >= 0 ? `${left} day${left === 1 ? "" : "s"} left` : "past due"}</p></div>
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

      <h2 className="mt-10 text-[20px] font-semibold tracking-tight">The checklist</h2>
      <ul className="mt-3 space-y-2.5 text-[16px] leading-snug">
        {["Show the real Mila app working on your screen. No stock footage.", "Put #milapartner and #sponsored (or #ad) in the caption, and tag Mila.", "Talk about what Mila does: reminders, calendar, drafting texts and emails. Don't promise income or results.", "Keep the video up for 30 days after you earn your free month."].map((t) => <li key={t} className="flex gap-3"><span aria-hidden className="mt-0.5 text-[18px]">✓</span><span>{t}</span></li>)}
      </ul>
      <div className="mt-8 rounded-3xl p-5 text-[15px] leading-relaxed text-foreground/80" style={{ background: "#f1effa" }}>
        <b>Easy ideas:</b> "Everything I forget in a week, handled by Mila", "I said it out loud and Mila put it on my calendar", "Watch Mila write my follow-up text in 5 seconds." Short and real beats polished.
      </div>
      <p className="mt-10 text-[13px] text-muted-foreground">Questions? Open Help &amp; support inside Mila. This page is private to you, so please don&apos;t share the link.</p>
    </main>
  );
}
