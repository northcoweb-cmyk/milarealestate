import { randomBytes } from "node:crypto";
import { table, write } from "./sb";
import { sendMail } from "./mail";
import { brandedEmail } from "./email-template";
import { appUrl } from "./invites";

/** The rules of the program, in one place. Change a number here and the whole program (emails, pages, cron) follows. */
export const PROGRAM = {
  videosNeeded: 3,
  windowDays: 14,          // days from access to get all 3 videos posted
  remindOnDay: [4, 9, 12], // reminder emails, counted from the day access was granted
  extendDays: 7,           // one extension of this many days is allowed per request
  rewardDays: 30,          // the free month
  rewardCredits: 1200,     // a full plan month of credits
  minViews: 200,           // soft bar a video should reach before it counts
  stayLiveDays: 30,        // videos must stay up this long after the reward
  hashtags: ["#milapartner", "#sponsored"],
  siteUrl: () => (process.env.NEXT_PUBLIC_SITE_URL || "https://milarealestate.app").replace(/\/+$/, ""),
} as const;

export type CreatorStatus = "invited" | "active" | "rewarded" | "expired" | "declined";
export interface Creator { id: string; created_at: string; name: string; email: string; handle: string | null; platform: string | null; followers: number | null; notes: string | null; token: string; status: CreatorStatus; access_at: string | null; deadline_at: string | null; reminders_sent: number; last_reminded_at: string | null; rewarded_at: string | null; reward_ends_at: string | null; closed_note: string | null }
export interface Video { id: string; created_at: string; creator_id: string; url: string; platform: string | null; views: number | null; status: "submitted" | "verified" | "changes" | "rejected"; checks: Record<string, boolean>; note: string | null; verified_at: string | null }

export { CHECKS } from "./creator-checks";
const DAY = 86_400_000;

export const newToken = () => randomBytes(24).toString("hex");
export const submitUrl = (token: string) => `${PROGRAM.siteUrl()}/creators/${token}`;
export const platformOf = (url: string) => (/tiktok\.com/i.test(url) ? "tiktok" : /instagram\.com/i.test(url) ? "instagram" : /youtu\.?be/i.test(url) ? "youtube" : "other");
export const daysLeft = (iso: string | null, now = Date.now()) => (iso ? Math.ceil((new Date(iso).getTime() - now) / DAY) : null);

export async function loadAll(): Promise<{ creators: Creator[]; videos: Video[] } | null> {
  const creators = await table<Creator>("creators", { select: "*", order: "created_at.desc" });
  if (!creators) return null;
  const videos = (await table<Video>("creator_videos", { select: "*", order: "created_at.asc" })) ?? [];
  return { creators, videos };
}
export const videosOf = (videos: Video[], id: string) => videos.filter((v) => v.creator_id === id);
export const verifiedCount = (videos: Video[], id: string) => videos.filter((v) => v.creator_id === id && v.status === "verified").length;

/** What each creator needs from you right now, most urgent first. */
export function attention(creators: Creator[], videos: Video[], now = Date.now()) {
  const out: { creator: Creator; kind: "review" | "reward" | "overdue" | "due_soon"; text: string }[] = [];
  for (const c of creators) {
    if (c.status !== "active") continue;
    const vs = videosOf(videos, c.id), ok = vs.filter((v) => v.status === "verified").length, waiting = vs.filter((v) => v.status === "submitted").length, left = daysLeft(c.deadline_at, now);
    if (ok >= PROGRAM.videosNeeded) out.push({ creator: c, kind: "reward", text: `All ${PROGRAM.videosNeeded} videos verified. Give the free month.` });
    else if (waiting) out.push({ creator: c, kind: "review", text: `${waiting} video${waiting === 1 ? "" : "s"} waiting for your check.` });
    else if (left !== null && left < 0) out.push({ creator: c, kind: "overdue", text: `${-left} day${left === -1 ? "" : "s"} past the deadline with ${ok}/${PROGRAM.videosNeeded} done.` });
    else if (left !== null && left <= 3) out.push({ creator: c, kind: "due_soon", text: `${left} day${left === 1 ? "" : "s"} left, ${ok}/${PROGRAM.videosNeeded} done.` });
  }
  const rank = { reward: 0, review: 1, overdue: 2, due_soon: 3 } as const;
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

// ---------------------------------------------------------------- emails
const rules = () => [`Show the real Mila app working on screen (no stock footage).`, `Say it's sponsored: use ${PROGRAM.hashtags.join(" and ")} in the caption and tag Mila.`, `No promises about income or results. Talk about what Mila does: reminders, calendar, drafting texts and emails.`, `Keep each video up for ${PROGRAM.stayLiveDays} days after you earn your free month.`];

export function creatorEmail(kind: "welcome" | "reminder" | "expired" | "reward" | "reward_end" | "changes", c: Creator, extra: { left?: number; done?: number; note?: string } = {}) {
  const first = c.name.split(/\s+/)[0] || "there";
  const link = submitUrl(c.token);
  const left = extra.left ?? daysLeft(c.deadline_at) ?? 0, done = extra.done ?? 0;
  const dl = c.deadline_at ? new Date(c.deadline_at).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }) : "";
  const note = "This is an automated message, so please don't reply. Use the link above to reach us.";
  const T: Record<string, { subject: string; heading: string; body: string; chip?: string; button: string }> = {
    welcome: { subject: "You're in: your Mila creator access", heading: `Welcome, ${first}. Let's make 3 videos.`, chip: `Due ${dl}`, button: "Open my creator page",
      body: `You now have full access to Mila. Post ${PROGRAM.videosNeeded} videos showing it in action by ${dl} (${PROGRAM.windowDays} days), and you get a free month of Mila on us.\n\nThe simple rules:\n${rules().map((r) => `• ${r}`).join("\n")}\n\nYour creator page has the checklist, and it's where you paste each video link when it's posted. We check every one and email you if anything needs a tweak.\n\nCheck your inbox for your sign-in email too. That's how you get into the app.` },
    reminder: { subject: `${left} day${left === 1 ? "" : "s"} left: ${done}/${PROGRAM.videosNeeded} videos`, heading: `${done} of ${PROGRAM.videosNeeded} done, ${left} day${left === 1 ? "" : "s"} to go`, chip: `Due ${dl}`, button: "Submit a video link",
      body: `Hi ${first}, a quick check-in. ${done ? `You've got ${done} in.` : "No videos are in yet."} You need ${PROGRAM.videosNeeded - done} more by ${dl}.\n\nShort and real works best: open Mila, ask it to schedule something, draft a text, set a reminder, and screen-record it. Add ${PROGRAM.hashtags.join(" ")} and paste the link on your page.` },
    expired: { subject: "Your Mila creator window has closed", heading: "Time's up on this round", button: "Ask for more time",
      body: `Hi ${first}, the ${PROGRAM.windowDays}-day window ended with ${done}/${PROGRAM.videosNeeded} videos verified, so the free month isn't unlocked and your creator access has ended.\n\nIf life got in the way, open your creator page and ask for more time. We're happy to extend once.` },
    changes: { subject: "One of your Mila videos needs a small fix", heading: "Almost there, one tweak", button: "Open my creator page", body: `Hi ${first}, we checked your video and it needs one change before it counts:\n\n“${extra.note ?? "Please see your creator page."}”\n\nFix it (or post a new one) and paste the link on your page.` },
    reward: { subject: "Your free month of Mila is on", heading: `Thank you, ${first}. Your month is on us.`, chip: "1 month free", button: "Open Mila",
      body: `All ${PROGRAM.videosNeeded} videos check out. Your account now has ${PROGRAM.rewardDays} days of full Mila with ${PROGRAM.rewardCredits.toLocaleString()} credits.\n\nOne ask: please keep the videos up for ${PROGRAM.stayLiveDays} days. If you love Mila, a plan keeps everything going after the month ends.` },
    reward_end: { subject: "Your free month of Mila ends today", heading: "Your free month is up", button: "Keep Mila going", body: `Hi ${first}, thank you again for the videos. Your free month ends today. Your data stays safe and visible. To keep Mila working for you, pick a plan inside the app.` },
  };
  const t = T[kind];
  const text = `${t.heading}\n\n${t.body}\n\n${t.button}: ${kind === "reward" || kind === "reward_end" ? appUrl() : link}\n\n${note}`;
  const html = brandedEmail({ preheader: t.heading, heading: t.heading, body: t.body, chip: t.chip, button: { label: t.button, href: kind === "reward" || kind === "reward_end" ? appUrl() : link }, note });
  return { subject: t.subject, text, html };
}

export async function sendCreatorEmail(kind: Parameters<typeof creatorEmail>[0], c: Creator, extra: Parameters<typeof creatorEmail>[2] = {}) {
  const m = creatorEmail(kind, c, extra);
  return sendMail(c.email, m.subject, m.text, m.html);
}

// ---------------------------------------------------------------- access and reward
interface Profile { id: string; email: string }
interface Sub { id: string; status: string; period_end: string; stripe_subscription_id: string | null }
export async function profileOf(email: string): Promise<Profile | null> { return (await table<Profile>("profiles", { select: "id,email", filter: `email=eq.${encodeURIComponent(email.toLowerCase())}` }))?.[0] ?? null; }
async function subOf(userId: string): Promise<Sub | null> { return (await table<Sub>("subscriptions", { select: "id,status,period_end,stripe_subscription_id", filter: `user_id=eq.${userId}` }))?.[0] ?? null; }
async function balanceOf(userId: string) { return ((await table<{ delta: number }>("credit_transactions", { select: "delta", filter: `user_id=eq.${userId}` })) ?? []).reduce((n, t) => n + t.delta, 0); }

/** A creator's trial must last through their window, or they could not finish the videos. Run when access is granted and every day. */
export async function syncAccess(c: Creator): Promise<string> {
  if (c.status !== "active" || !c.deadline_at) return "not active";
  const p = await profileOf(c.email);
  if (!p) return "no account yet";
  const s = await subOf(p.id);
  if (!s || s.status !== "trial") return "not on a trial";
  const want = new Date(new Date(c.deadline_at).getTime() + DAY).toISOString();
  if (new Date(s.period_end) >= new Date(want)) return "already covered";
  await write("subscriptions", "PATCH", { filter: `id=eq.${s.id}`, body: { period_end: want } });
  await write("credit_transactions", "POST", { body: { user_id: p.id, kind: "adjust", delta: 0, balance_after: await balanceOf(p.id), reason: `Creator access kept through the video deadline (${want.slice(0, 10)})` } });
  return "extended";
}

/** The free month: a full plan period and a full month of credits, written to the ledger. Only after the videos are verified. */
export async function giveFreeMonth(c: Creator): Promise<{ ok: boolean; message: string }> {
  const p = await profileOf(c.email);
  if (!p) return { ok: false, message: "They haven't created their Mila account yet. Ask them to sign in with the link in their email first." };
  const s = await subOf(p.id);
  if (!s) return { ok: false, message: "No subscription record for that account yet." };
  if (s.stripe_subscription_id && s.status === "active") return { ok: false, message: "They already pay for a plan. Offer them a month of credit in Stripe instead." };
  const now = new Date(), end = new Date(now.getTime() + PROGRAM.rewardDays * DAY);
  const r = await write("subscriptions", "PATCH", { filter: `id=eq.${s.id}`, body: { plan_key: "mila", status: "active", credits_per_period: PROGRAM.rewardCredits, period_start: now.toISOString(), period_end: end.toISOString() } });
  if (!r) return { ok: false, message: "The subscription change didn't save." };
  const bal = await balanceOf(p.id);
  await write("credit_transactions", "POST", { body: { user_id: p.id, kind: "grant", delta: PROGRAM.rewardCredits, balance_after: bal + PROGRAM.rewardCredits, reason: "Creator program: 1 free month" } });
  await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { status: "rewarded", rewarded_at: now.toISOString(), reward_ends_at: end.toISOString() } });
  return { ok: true, message: `Free month on for ${c.email} until ${end.toISOString().slice(0, 10)}.` };
}

/** The free month ending: the plan is set to ended (data stays visible) unless they have since started paying. */
export async function endFreeMonth(c: Creator): Promise<string> {
  const p = await profileOf(c.email);
  if (!p) return "no account";
  const s = await subOf(p.id);
  if (!s || s.stripe_subscription_id) return "now a paying customer";
  if (s.status === "active") await write("subscriptions", "PATCH", { filter: `id=eq.${s.id}`, body: { status: "canceled" } });
  return "ended";
}
