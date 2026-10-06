import type { Ctx } from "./agent/context";
import { firstName, plural } from "./agent/context";
import { computePriorities } from "./agent/prioritize";
import { platformLabel } from "./content/service";
import { approvalEmoji, eventEmoji, platformEmoji, taskEmoji } from "./emoji";
import { DAY_MS, fmtDay, fmtTime, relativeDays, startOfDay } from "./time";

/**
 * The Home feed, Muse-style: it answers two questions plainly —
 *   "What do I need to do?"  (needsYou: a few decisions, each with ONE clear action)
 *   "What did Mila do?"      (did: short, past-tense updates)
 * plus "Coming up". Everything is derived from existing data (no extra AI calls, no new tables).
 */
export interface FeedAction { label: string; href?: string; approveId?: string; ask?: string }
export interface NeedsItem { id: string; emoji: string; label?: string; title: string; why: string | null; primary: FeedAction; secondary?: FeedAction; tone: "urgent" | "normal" }
export interface DidItem { id: string; emoji: string; text: string; at: string; href?: string }
export interface UpItem { id: string; emoji: string; time: string; day: string; title: string; place: string | null; href: string; kind: string; startAt: string; endAt: string; propertyId: string | null; location: string | null }

export interface PlanItem { id: string; emoji: string; done: boolean; title: string; why: string; action: FeedAction }

export interface SetupItem { id: string; label: string; done: boolean; ask: string }
export interface TrialInfo { day: number; daysLeft: number; expired: boolean; done: number; total: number; items: SetupItem[] }

export interface Feed {
  /** only during the free trial: where they are in it, and the five things that make Mila stick */
  trial: TrialInfo | null;
  summary: string;
  plan: PlanItem[];
  updatedAt: string;
  needsYou: NeedsItem[];
  needsTotal: number;
  did: DidItem[];
  next: UpItem[];
}

const APPROVAL_LABEL: Record<string, string> = { send_email: "Email", send_bulk_email: "Email", send_sms: "Text", publish_social: "Post", calendar_create: "Calendar", calendar_change: "Calendar", calendar_cancel: "Calendar", send_document: "Document", delete: "Delete" };
const POST_LABEL: Record<string, string> = { just_listed: "Instagram announcement", open_house: "Open house post", price_improvement: "Price update post", just_sold: "Just sold post" };
const ask = (q: string) => `/?ask=${encodeURIComponent(q)}`;

export async function buildFeed(ctx: Ctx): Promise<Feed> {
  const { store, userId, now, tz } = ctx;
  const [approvals, tasks, contacts, events, runs, drafts, posts, reminders, props, images] = await Promise.all([
    store.list("approvals", userId), store.list("tasks", userId), store.list("contacts", userId), store.list("calendar_events", userId),
    store.list("workflow_runs", userId), store.list("email_drafts", userId), store.list("social_posts", userId), store.list("reminders", userId), store.list("properties", userId), store.list("property_images", userId),
  ]);
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const needs: (NeedsItem & { score: number })[] = [];

  // 1. decisions waiting on the agent
  for (const a of approvals.filter((x) => x.status === "pending")) {
    const t = tasks.find((x) => x.approval_id === a.id);
    const soon = t?.priority === "urgent" ? 90 : t?.priority === "important" ? 70 : 55;
    needs.push({ id: `ap-${a.id}`, emoji: approvalEmoji(a.action), label: APPROVAL_LABEL[a.action] ?? "Approval", title: a.title, why: a.summary, primary: { label: a.risk === "high" ? "Review" : "Approve", approveId: a.risk === "high" ? undefined : a.id, href: a.risk === "high" ? `/tasks?approval=${a.id}` : undefined }, secondary: { label: "Review", href: `/tasks?approval=${a.id}` }, tone: soon >= 90 ? "urgent" : "normal", score: soon });
  }
  // 2. people who need a follow-up (prioritised by real data)
  for (const p of (await computePriorities(ctx)).filter((x) => x.source !== "event" && x.kind !== "approval")) {
    const c = p.contactId ? cById.get(p.contactId) : undefined;
    if (!c) continue;
    needs.push({ id: `fu-${p.id}`, emoji: "💬", label: "Follow-up", title: `Follow up with ${firstName(c.name)}`, why: [p.subtitle, p.reason].filter(Boolean).join(" · ") || null, primary: { label: "Draft message", href: ask(`Draft a follow-up email to ${c.name}`) }, secondary: { label: "Open", href: `/contacts/${c.id}` }, tone: p.priority === "urgent" ? "urgent" : "normal", score: 30 + Math.min(p.score, 50) });
  }
  // 3. content waiting for review
  const reviewable = posts.filter((p) => p.status === "draft" || p.status === "pending_approval");
  // each draft is its own line, named for what it is ("Instagram announcement · 1231 Main Street"), newest first
  const propName = new Map(props.map((p) => [p.id, p.address]));
  const sortedDrafts = [...reviewable].sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const [i, p] of sortedDrafts.slice(0, 3).entries()) {
    const what = POST_LABEL[p.category ?? ""] ?? `${platformLabel(p.platform)} post`;
    needs.push({ id: `post-${p.id}`, emoji: platformEmoji(p.platform), label: "Post", title: `${what}${p.property_id && propName.get(p.property_id) ? ` · ${propName.get(p.property_id)}` : ""}`, why: "Mila wrote it — check it, edit if you like, then it's yours to post.", primary: { label: "Review", href: "/content?tab=drafts" }, tone: "normal", score: 88 - i }); // a finished draft is a one-tap decision: it outranks "go draft something"
  }
  if (sortedDrafts.length > 3) needs.push({ id: "content-review", emoji: "📣", label: "Post", title: `${plural(sortedDrafts.length - 3, "more post")} ready for your review`, why: null, primary: { label: "Review posts", href: "/content?tab=drafts" }, tone: "normal", score: 40 });
  // 4. outdated messages after a schedule change
  const stale = drafts.filter((d) => d.stale && d.status !== "sent").length + posts.filter((p) => p.stale).length;
  if (stale) needs.push({ id: "stale", emoji: "⚠️", title: `${plural(stale, "message")} may be out of date`, why: "A time changed after they were written.", primary: { label: "Ask Mila to update", href: ask("Update my messages for the new time") }, tone: "normal", score: 60 });
  // 5. double-booked today
  const today = events.filter((e) => e.status === "confirmed" && new Date(e.start_at).getTime() >= now.getTime() - 3_600_000 && new Date(e.start_at).getTime() < now.getTime() + DAY_MS).sort((a, b) => a.start_at.localeCompare(b.start_at));
  for (let i = 0; i < today.length; i++) for (let j = i + 1; j < today.length; j++) {
    if (new Date(today[i].start_at) < new Date(today[j].end_at) && new Date(today[j].start_at) < new Date(today[i].end_at)) needs.push({ id: `cf-${today[i].id}-${today[j].id}`, emoji: "⚠️", title: "Two things overlap on your calendar", why: `${today[i].title.split(/[—,]/)[0].trim()} and ${today[j].title.split(/[—,]/)[0].trim()}`, primary: { label: "Fix it", href: "/calendar" }, tone: "urgent", score: 85 });
  }

  needs.sort((a, b) => b.score - a.score);
  const needsYou = needs.slice(0, 5).map(({ score, ...n }) => { void score; return n; });
  const shownContacts = new Set(needs.slice(0, 5).map((n) => n.id.startsWith("fu-") ? n.title.replace("Follow up with ", "") : "").filter(Boolean));

  // ------------------------------------------------------------------ Mila did (last 36h, past tense)
  const since = now.getTime() - 36 * 3_600_000;
  const did: (DidItem & { ms: number })[] = [];
  const when = (iso: string) => new Date(iso).getTime();
  for (const r of runs.filter((x) => when(x.created_at) >= since)) {
    const n = r.plan.filter((p) => p.state === "done").length;
    const label = r.workflow_key === "open_house" ? `Prepared your open house at ${r.title}` : r.workflow_key.startsWith("new_") ? `Set up ${r.title}` : `Ran “${r.title}”`;
    did.push({ id: `run-${r.id}`, emoji: r.workflow_key === "open_house" ? "🏠" : "⚡", text: `${label}${n ? ` — ${plural(n, "thing")} done` : ""}`, at: r.created_at, ms: when(r.created_at), href: "/tasks" });
  }
  for (const a of approvals.filter((x) => x.status === "executed" && x.executed_at && when(x.executed_at) >= since)) did.push({ id: `ex-${a.id}`, emoji: approvalEmoji(a.action), text: `Completed: ${a.title}`, at: a.executed_at!, ms: when(a.executed_at!) });
  for (const m of reminders.filter((x) => x.status === "delivered" && x.delivered_at && when(x.delivered_at) >= since)) did.push({ id: `rm-${m.id}`, emoji: "⏰", text: `Reminded you: ${m.title}`, at: m.delivered_at!, ms: when(m.delivered_at!) });
  const imported = contacts.filter((c) => when(c.created_at) >= since && /open house|import|upload|sign-in/i.test(c.source ?? "")).length;
  if (imported) did.push({ id: "imp", emoji: "👥", text: `Added ${plural(imported, "contact")} from your sheet`, at: now.toISOString(), ms: now.getTime() - 1, href: "/contacts" });
  for (const p of posts.filter((x) => x.status === "published" && x.posted_at && when(x.posted_at) >= since)) did.push({ id: `po-${p.id}`, emoji: platformEmoji(p.platform), text: `Marked a ${p.platform} post as posted`, at: p.posted_at!, ms: when(p.posted_at!), href: "/content?tab=posted" });
  did.sort((a, b) => b.ms - a.ms);

  // ------------------------------------------------------------------ coming up
  const propById = new Map(props.map((p) => [p.id, p]));
  const next = events.filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > now.getTime() && new Date(e.start_at).getTime() < now.getTime() + 7 * DAY_MS)
    .sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 4)
    .map((e): UpItem => ({ id: e.id, emoji: eventEmoji(e.kind), time: fmtTime(e.start_at, tz), day: relativeDays(e.start_at, now, tz), title: e.title, place: e.property_id ? propById.get(e.property_id)?.address ?? e.location : e.location, href: "/calendar", kind: e.kind, startAt: e.start_at, endAt: e.end_at, propertyId: e.property_id, location: e.property_id ? [propById.get(e.property_id)?.address, propById.get(e.property_id)?.city, propById.get(e.property_id)?.state].filter(Boolean).join(", ") || e.location : e.location }));

  // ------------------------------------------------------------------ today's plan (recommendations, ≤5)
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const doneKeys = new Set(tasks.filter((t) => t.status === "done" && t.priority_reason?.startsWith("plan:")).map((t) => t.priority_reason));
  const plan: PlanItem[] = [];
  const addPlan = (p: Omit<PlanItem, "done">) => plan.push({ ...p, done: doneKeys.has(`plan:${p.id}:${dayKey}`) });
  const dayEnd = new Date(startOfDay(now, tz).getTime() + DAY_MS);
  const tomorrowEnd = new Date(dayEnd.getTime() + DAY_MS);
  const inDay = (iso: string, end: Date) => { const t = new Date(iso).getTime(); return t >= now.getTime() - 3_600_000 && t < end.getTime(); };
  for (const e of events.filter((x) => x.status === "confirmed" && inDay(x.start_at, tomorrowEnd) && x.contact_id).slice(0, 2)) {
    const c = cById.get(e.contact_id!);
    if (c && !shownContacts.has(firstName(c.name))) addPlan({ id: `cf-${e.id}`, emoji: "✉️", title: `Confirm with ${firstName(c.name)}`, why: `${e.title.split(/[—,]/)[0].trim()} · ${relativeDays(e.start_at, now, tz)} ${fmtTime(e.start_at, tz)}`, action: { label: "Draft confirmation", href: ask(`Draft a confirmation message to ${c.name} for ${e.title}`) } });
  }
  for (const e of events.filter((x) => x.status === "confirmed" && x.kind === "open_house" && x.property_id && new Date(x.start_at) > now && new Date(x.start_at).getTime() < now.getTime() + 3 * DAY_MS).slice(0, 1)) {
    if (!images.some((i) => i.property_id === e.property_id)) addPlan({ id: `ph-${e.id}`, emoji: "📸", title: "Add photos for your open house", why: `${propById.get(e.property_id!)?.address ?? "The listing"} has no photos yet.`, action: { label: "Pull photos", href: `/properties/${e.property_id}` } });
  }
  const dueToday = posts.filter((p) => p.status === "scheduled" && p.scheduled_for && inDay(p.scheduled_for, dayEnd));
  if (dueToday.length) addPlan({ id: "post-today", emoji: "📣", title: `Post ${plural(dueToday.length, "scheduled post")} today`, why: "Mila reminds you at the scheduled time.", action: { label: "Open posts", href: "/content?tab=scheduled" } });
  const dueRem = reminders.filter((r) => r.status === "pending" && inDay(r.remind_at, dayEnd)).sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  if (dueRem.length) addPlan({ id: `rm-${dueRem[0].id}`, emoji: "⏰", title: dueRem[0].title, why: `Reminder at ${fmtTime(dueRem[0].remind_at, tz)}${dueRem.length > 1 ? ` · +${dueRem.length - 1} more today` : ""}`, action: { label: "Calendar", href: "/calendar" } });
  const fresh = contacts.filter((c) => c.status === "new" && !c.last_contact_at && now.getTime() - new Date(c.created_at).getTime() < 7 * DAY_MS).slice(0, 1);
  for (const c of fresh.filter((x) => !shownContacts.has(firstName(x.name)))) addPlan({ id: `nl-${c.id}`, emoji: "🌱", title: `Say hello to ${firstName(c.name)}`, why: "New lead — nobody has reached out yet.", action: { label: "Draft intro", href: ask(`Draft a first message to ${c.name}`) } });
  const upcomingPosts = posts.some((p) => ["scheduled", "approved_unpublished", "draft", "pending_approval"].includes(p.status) && (p.status !== "scheduled" || (p.scheduled_for && new Date(p.scheduled_for).getTime() < now.getTime() + 7 * DAY_MS)));
  if (!upcomingPosts) addPlan({ id: "plan-content", emoji: "📣", title: "Plan this week's content", why: "Nothing is lined up for the next 7 days.", action: { label: "Plan with Mila", href: "/content?plan=1" } });
  if (plan.length === 0) addPlan({ id: "ask-day", emoji: "💡", title: "Ask Mila what to focus on", why: "Nothing urgent — a good day to build your pipeline.", action: { label: "Ask Mila", href: ask("Who should I follow up with today?") } });

  const n = needs.length;
  const summary = n === 0 ? "You're all caught up. Mila has the rest handled." : n === 1 ? "1 thing is ready for you. Everything else is handled." : n <= 5 ? `${n} things are ready for you. Everything else is handled.` : `Start with these 5 — ${n} things are ready for you.`;
  void fmtDay;

  // ---- free trial: day count + the five actions that turn "cool app" into "I rely on this"
  const sub = (await store.list("subscriptions", userId))[0];
  let trial: TrialInfo | null = null;
  if (sub?.status === "trial") {
    const usage = await store.list("usage", userId);
    const did = (...ops: string[]) => usage.some((u) => ops.includes(u.operation));
    const items: SetupItem[] = [
      { id: "listing", label: "Add an upcoming listing", done: props.some((p) => !p.is_demo), ask: "I'm listing 123 Main Street next Thursday. Get me ready." },
      { id: "meeting", label: "Prep for a meeting", done: did("turn:meeting_prep"), ask: "Prep me for my next meeting" },
      { id: "openhouse", label: "Create an open house", done: events.some((e) => e.kind === "open_house") || did("turn:open_house"), ask: "I have an open house Sunday at 1 PM. Set everything up." },
      { id: "followup", label: "Draft a follow-up", done: drafts.length > 0 || did("turn:batch_followups", "turn:showing_followups", "turn:draft_email"), ask: "Who should I follow up with today?" },
      { id: "social", label: "Generate social content", done: posts.length > 0, ask: "Create an Instagram post for my newest listing" },
    ];
    const t = new Date(sub.period_end).getTime();
    trial = { day: Math.min(7, Math.max(1, Math.floor((now.getTime() - new Date(sub.period_start).getTime()) / DAY_MS) + 1)), daysLeft: Math.max(0, Math.ceil((t - now.getTime()) / DAY_MS)), expired: t < now.getTime(), done: items.filter((i) => i.done).length, total: items.length, items };
  }
  return { trial, summary, plan: plan.slice(0, 5), updatedAt: now.toISOString(), needsYou, needsTotal: n, did: did.slice(0, 4).map(({ ms, ...d }) => { void ms; return d; }), next };
}

// ---------------------------------------------------------------------- completed timeline
export interface TimelineItem { id: string; emoji: string; text: string; sub: string | null; at: string; by: "you" | "mila"; href?: string }
export interface TimelineDay { key: string; label: string; items: TimelineItem[] }

export const planEmoji = (id: string) => (id.startsWith("cf-") ? "✉️" : id.startsWith("ph-") ? "📸" : id.startsWith("post-") || id === "plan-content" ? "📣" : id.startsWith("rm-") ? "⏰" : id.startsWith("nl-") ? "🌱" : "✅");

/** Everything that got done — by you or by Mila — newest first, grouped by day, so you can see how the work flowed. */
export async function buildTimeline(ctx: Ctx, days = 14): Promise<{ days: TimelineDay[]; total: number; byYou: number; byMila: number }> {
  const { store, userId, now, tz } = ctx;
  const since = now.getTime() - days * DAY_MS;
  const [tasks, approvals, runs, reminders, posts, events] = await Promise.all([
    store.list("tasks", userId), store.list("approvals", userId), store.list("workflow_runs", userId), store.list("reminders", userId), store.list("social_posts", userId), store.list("calendar_events", userId),
  ]);
  const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
  const out: TimelineItem[] = [];
  for (const k of tasks.filter((x) => x.status === "done" && t(x.completed_at) >= since)) out.push({ id: `t-${k.id}`, emoji: k.priority_reason?.startsWith("plan:") ? planEmoji(k.priority_reason.split(":")[1]) : taskEmoji(k.kind), text: k.title, sub: k.subtitle, at: k.completed_at!, by: "you" });
  for (const a of approvals.filter((x) => x.status === "executed" && t(x.executed_at) >= since)) out.push({ id: `a-${a.id}`, emoji: approvalEmoji(a.action), text: a.title, sub: "Approved by you, done by Mila", at: a.executed_at!, by: "mila" });
  for (const r of runs.filter((x) => t(x.created_at) >= since && x.plan.some((p) => p.state === "done"))) out.push({ id: `r-${r.id}`, emoji: r.workflow_key === "open_house" ? "🏠" : "⚡", text: r.workflow_key === "open_house" ? `Prepared your open house at ${r.title}` : r.title, sub: `${plural(r.plan.filter((p) => p.state === "done").length, "step")} done`, at: r.created_at, by: "mila", href: "/tasks" });
  for (const m of reminders.filter((x) => x.status === "delivered" && t(x.delivered_at) >= since)) out.push({ id: `m-${m.id}`, emoji: "⏰", text: `Reminded you: ${m.title}`, sub: null, at: m.delivered_at!, by: "mila" });
  for (const p of posts.filter((x) => x.status === "published" && t(x.posted_at) >= since)) out.push({ id: `p-${p.id}`, emoji: platformEmoji(p.platform), text: `Posted to ${p.platform}`, sub: p.caption.slice(0, 80), at: p.posted_at!, by: "you", href: "/content?tab=posted" });
  for (const e of events.filter((x) => x.status === "confirmed" && t(x.end_at) < now.getTime() && t(x.end_at) >= since)) out.push({ id: `e-${e.id}`, emoji: eventEmoji(e.kind), text: e.title, sub: `${fmtDay(e.start_at, tz)} · ${fmtTime(e.start_at, tz)}`, at: e.end_at, by: "you", href: "/calendar" });
  out.sort((a, b) => b.at.localeCompare(a.at));
  const keyOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  const today = keyOf(now.toISOString()), yest = keyOf(new Date(now.getTime() - DAY_MS).toISOString());
  const groups = new Map<string, TimelineItem[]>();
  for (const i of out) groups.set(keyOf(i.at), [...(groups.get(keyOf(i.at)) ?? []), i]);
  const daysOut = [...groups].map(([key, items]) => ({ key, label: key === today ? "Today" : key === yest ? "Yesterday" : fmtDay(items[0].at, tz), items }));
  return { days: daysOut, total: out.length, byYou: out.filter((i) => i.by === "you").length, byMila: out.filter((i) => i.by === "mila").length };
}
