/**
 * Mila's read on one client: a plain summary of where they stand, and what to do NOW, SOON and LATER.
 * Built only from what is saved (contact fields, notes, remembered facts, timeline, calendar, tasks, drafts), so it is free,
 * instant and never invents anything. Every step says what it is and offers a one-tap ask.
 */
import type { Contact } from "../types";
import { type Ctx, fullMoney } from "./context";
import { contactFacts } from "./memory";
import { firstNameOf } from "../names";

export interface BriefStep { text: string; why?: string; ask?: string }
export interface ClientBrief { name: string; headline: string; summary: string; now: BriefStep[]; soon: BriefStep[]; later: BriefStep[]; watch: string[] }

const DAY = 86_400_000;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export async function buildClientBrief(ctx: Ctx, c: Contact): Promise<ClientBrief> {
  const first = firstNameOf(c.name);
  const [events, calendar, tasks, drafts, notes, facts] = await Promise.all([
    ctx.store.list("contact_events", ctx.userId), ctx.store.list("calendar_events", ctx.userId), ctx.store.list("tasks", ctx.userId),
    ctx.store.list("email_drafts", ctx.userId), ctx.store.list("contact_notes", ctx.userId), contactFacts(ctx, c).catch(() => [] as string[]),
  ]);
  const mine = events.filter((e) => e.contact_id === c.id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const now = ctx.now.getTime();
  const lastIso = c.last_contact_at ?? mine.find((e) => /email|text|call|showing|note/.test(e.kind))?.occurred_at ?? null;
  const daysSince = lastIso ? Math.floor((now - new Date(lastIso).getTime()) / DAY) : null;
  const evs = calendar.filter((e) => e.status === "confirmed" && (e.contact_id === c.id || e.title.toLowerCase().includes(c.name.toLowerCase()) || e.title.toLowerCase().includes(first.toLowerCase())));
  const upcoming = evs.filter((e) => new Date(e.end_at).getTime() > now).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = evs.filter((e) => new Date(e.end_at).getTime() <= now);
  const showingsDone = past.filter((e) => e.kind === "showing" || /showing/i.test(e.title)).length;
  const openTasks = tasks.filter((t) => t.contact_id === c.id && t.status === "open");
  const overdue = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const waiting = drafts.filter((d) => d.to_contact_ids.includes(c.id) && d.status !== "sent");
  const myNotes = notes.filter((n) => n.contact_id === c.id);
  const when = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));

  const role = c.type === "rental" ? "renter" : c.type === "past_client" ? "past client" : c.type;
  const seller = c.type === "seller", buyer = ["buyer", "rental", "lead", "investor"].includes(c.type);
  const bits: string[] = [];
  if (c.budget_max) bits.push(`${seller ? "hoping for around" : "a budget up to"} ${fullMoney(c.budget_max)}`);
  if (c.location) bits.push(`${seller ? "in" : "looking in"} ${c.location}`);
  if (c.timeline) bits.push(`timing: ${c.timeline}`);
  const extra = facts.filter((f) => !/^(budget|location|timeline)\b/i.test(f) && !(c.location && f.toLowerCase().includes(c.location.toLowerCase())) && !/^~?\$[\d,]+$/.test(f.trim())).slice(0, 3);
  const sentences: string[] = [`${first} is a ${role} (${c.status}).`];
  if (bits.length) sentences.push(`${bits.join("; ")[0].toUpperCase()}${bits.join("; ").slice(1)}.`);
  if (extra.length) sentences.push(`What I know: ${extra.join("; ")}.`);
  sentences.push(daysSince == null ? `I have no record of contact yet.` : daysSince === 0 ? `You were in touch today.` : `Last contact was ${plural(daysSince, "day")} ago.`);
  if (showingsDone) sentences.push(`${plural(showingsDone, "showing")} so far.`);
  if (upcoming[0]) sentences.push(`Next on the calendar: ${upcoming[0].title.split(" — ")[0]}, ${when(upcoming[0].start_at)}.`);
  if (myNotes[0]) sentences.push(`Latest note: “${myNotes[0].body.slice(0, 110)}${myNotes[0].body.length > 110 ? "…" : ""}”.`);

  const now_: BriefStep[] = [], soon: BriefStep[] = [], later: BriefStep[] = [];
  const watch: string[] = [];
  if (overdue.length) now_.push({ text: `Finish the overdue item: ${overdue[0].title}`, why: `${plural(overdue.length, "to-do")} past due for ${first}`, ask: `Mark "${overdue[0].title}" done` });
  if (waiting.length) now_.push({ text: `Review the draft waiting for ${first}`, why: `${plural(waiting.length, "draft")} not sent yet`, ask: `Show my drafts for ${c.name}` });
  if (upcoming[0] && new Date(upcoming[0].start_at).getTime() - now < 2 * DAY) now_.push({ text: `Get ready for ${upcoming[0].title.split(" — ")[0]} (${when(upcoming[0].start_at)})`, ask: `Prep me for my meeting with ${first}` });
  if (daysSince != null && daysSince >= (c.importance === 3 ? 3 : 7) && c.status !== "inactive") now_.push({ text: `Reach out: it has been ${plural(daysSince, "day")}`, why: `${first} is ${c.importance === 3 ? "a high-value client" : "going quiet"}`, ask: `Draft a follow-up email to ${c.name}` });
  if (daysSince == null && c.status !== "inactive") now_.push({ text: `Make first contact`, ask: `Draft an intro email to ${c.name}` });
  const missing = [!c.phone && "phone", !c.email && "email", buyer && !c.budget_max && "budget", buyer && !c.location && "area", buyer && !/pre-?approv/i.test(facts.join(" ") + (c.notes ?? "")) && "pre-approval status"].filter(Boolean) as string[];
  if (missing.length) { now_.push({ text: `Fill in: ${missing.join(", ")}`, why: "so I can match homes and write better messages", ask: `Update ${c.name}: ` }); }
  if (!now_.length) now_.push({ text: `Nothing urgent. ${first} is in good shape.`, why: "no overdue items, nothing waiting" });

  if (buyer) {
    soon.push({ text: `Send ${first} homes that fit${c.budget_max ? ` (up to ${fullMoney(c.budget_max)})` : ""}`, ask: `Which homes fit ${c.name}?` });
    if (!upcoming.length) soon.push({ text: `Book the next showing or tour`, ask: `Schedule a showing with ${c.name}` });
    if (showingsDone) soon.push({ text: `Ask ${first} how the showings felt, and what to change`, ask: `Draft a text to ${c.name} asking how the showings went` });
    soon.push({ text: `Set a weekly check-in so ${first} never goes quiet`, ask: `Remind me every week to check in with ${c.name}` });
    later.push({ text: `When ${first} is ready to offer: line up the offer, then inspection and appraisal dates`, ask: `${first} is making an offer` });
    later.push({ text: `After closing: thank-you, a review request and a home-anniversary note`, ask: `Remind me to ask ${c.name} for a review after closing` });
  } else if (seller) {
    soon.push({ text: `Confirm the price, list date and what is still missing for the listing`, ask: `What am I missing for ${first}'s listing?` });
    soon.push({ text: `Plan the launch: photos, a Coming Soon or Just Listed post, and an open house`, ask: `Make a Coming Soon post for ${first}'s home` });
    soon.push({ text: `Send ${first} a weekly update: showings, feedback and traffic`, ask: `Draft an update email to ${c.name}` });
    later.push({ text: `Review the price after two weeks on the market if there are few showings`, ask: `${first}'s listing has been sitting; how should I handle the price?` });
    later.push({ text: `When offers come in: log them, compare terms, then walk ${first} through the choice`, ask: `We got an offer on ${first}'s home` });
    later.push({ text: `After closing: thank-you and a request for a review and referrals` });
  } else {
    later.push({ text: `Stay in touch every few months: a market note, a holiday card, a home-anniversary message`, ask: `Draft a check-in email to ${c.name}` });
    later.push({ text: `Ask ${first} for a referral when the timing is right` });
    soon.push({ text: `Send a short check-in so ${first} remembers you`, ask: `Draft a check-in email to ${c.name}` });
  }
  if (c.status === "inactive") watch.push(`${first} is marked inactive, so follow-ups are paused.`);
  if (seller && buyer) watch.push(`${first} is both buying and selling: the sale timing decides the purchase.`);
  if (daysSince != null && daysSince > 30) watch.push(`No contact in over a month: they may be talking to someone else.`);
  if (!c.email && !c.phone) watch.push(`No way to reach ${first} yet.`);
  return { name: c.name, headline: `${first} · ${role}`, summary: sentences.join(" "), now: now_, soon, later, watch };
}
