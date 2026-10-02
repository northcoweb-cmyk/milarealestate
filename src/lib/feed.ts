import type { Ctx } from "./agent/context";
import { firstName, plural } from "./agent/context";
import { computePriorities } from "./agent/prioritize";
import { DAY_MS, fmtDay, fmtTime, relativeDays, startOfDay } from "./time";

/**
 * The Home feed, Muse-style: it answers two questions plainly —
 *   "What do I need to do?"  (needsYou: a few decisions, each with ONE clear action)
 *   "What did Mila do?"      (did: short, past-tense updates)
 * plus "Coming up". Everything is derived from existing data (no extra AI calls, no new tables).
 */
export interface FeedAction { label: string; href?: string; approveId?: string; ask?: string }
export interface NeedsItem { id: string; title: string; why: string | null; primary: FeedAction; secondary?: FeedAction; tone: "urgent" | "normal" }
export interface DidItem { id: string; text: string; at: string; href?: string }
export interface UpItem { id: string; time: string; day: string; title: string; place: string | null; href: string }

export interface PlanItem { id: string; title: string; why: string; action: FeedAction }

export interface Feed {
  summary: string;
  plan: PlanItem[];
  updatedAt: string;
  needsYou: NeedsItem[];
  needsTotal: number;
  did: DidItem[];
  next: UpItem[];
}

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
    needs.push({ id: `ap-${a.id}`, title: a.title, why: a.summary, primary: { label: a.risk === "high" ? "Review" : "Approve", approveId: a.risk === "high" ? undefined : a.id, href: a.risk === "high" ? `/tasks?approval=${a.id}` : undefined }, secondary: { label: "Review", href: `/tasks?approval=${a.id}` }, tone: soon >= 90 ? "urgent" : "normal", score: soon });
  }
  // 2. people who need a follow-up (prioritised by real data)
  for (const p of (await computePriorities(ctx)).filter((x) => x.source !== "event" && x.kind !== "approval")) {
    const c = p.contactId ? cById.get(p.contactId) : undefined;
    if (!c) continue;
    needs.push({ id: `fu-${p.id}`, title: `Follow up with ${firstName(c.name)}`, why: [p.subtitle, p.reason].filter(Boolean).join(" · ") || null, primary: { label: "Draft message", href: ask(`Draft a follow-up email to ${c.name}`) }, secondary: { label: "Open", href: `/contacts/${c.id}` }, tone: p.priority === "urgent" ? "urgent" : "normal", score: 40 + Math.min(p.score, 50) });
  }
  // 3. content waiting for review
  const reviewable = posts.filter((p) => p.status === "draft" || p.status === "pending_approval");
  if (reviewable.length) needs.push({ id: "content-review", title: `${plural(reviewable.length, "post")} ready for your review`, why: "Mila wrote them — check, edit, then schedule.", primary: { label: "Review posts", href: "/content?tab=drafts" }, tone: "normal", score: 45 });
  // 4. outdated messages after a schedule change
  const stale = drafts.filter((d) => d.stale && d.status !== "sent").length + posts.filter((p) => p.stale).length;
  if (stale) needs.push({ id: "stale", title: `${plural(stale, "message")} may be out of date`, why: "A time changed after they were written.", primary: { label: "Ask Mila to update", href: ask("Update my messages for the new time") }, tone: "normal", score: 60 });
  // 5. double-booked today
  const today = events.filter((e) => e.status === "confirmed" && new Date(e.start_at).getTime() >= now.getTime() - 3_600_000 && new Date(e.start_at).getTime() < now.getTime() + DAY_MS).sort((a, b) => a.start_at.localeCompare(b.start_at));
  for (let i = 0; i < today.length; i++) for (let j = i + 1; j < today.length; j++) {
    if (new Date(today[i].start_at) < new Date(today[j].end_at) && new Date(today[j].start_at) < new Date(today[i].end_at)) needs.push({ id: `cf-${today[i].id}-${today[j].id}`, title: "Two things overlap on your calendar", why: `${today[i].title.split(/[—,]/)[0].trim()} and ${today[j].title.split(/[—,]/)[0].trim()}`, primary: { label: "Fix it", href: "/calendar" }, tone: "urgent", score: 85 });
  }

  needs.sort((a, b) => b.score - a.score);
  const needsYou = needs.slice(0, 3).map(({ score, ...n }) => { void score; return n; });

  // ------------------------------------------------------------------ Mila did (last 36h, past tense)
  const since = now.getTime() - 36 * 3_600_000;
  const did: (DidItem & { ms: number })[] = [];
  const when = (iso: string) => new Date(iso).getTime();
  for (const r of runs.filter((x) => when(x.created_at) >= since)) {
    const n = r.plan.filter((p) => p.state === "done").length;
    const label = r.workflow_key === "open_house" ? `Prepared your open house at ${r.title}` : r.workflow_key.startsWith("new_") ? `Set up ${r.title}` : `Ran “${r.title}”`;
    did.push({ id: `run-${r.id}`, text: `${label}${n ? ` — ${plural(n, "thing")} done` : ""}`, at: r.created_at, ms: when(r.created_at), href: "/tasks" });
  }
  for (const a of approvals.filter((x) => x.status === "executed" && x.executed_at && when(x.executed_at) >= since)) did.push({ id: `ex-${a.id}`, text: `Completed: ${a.title}`, at: a.executed_at!, ms: when(a.executed_at!) });
  for (const m of reminders.filter((x) => x.status === "delivered" && x.delivered_at && when(x.delivered_at) >= since)) did.push({ id: `rm-${m.id}`, text: `Reminded you: ${m.title}`, at: m.delivered_at!, ms: when(m.delivered_at!) });
  const imported = contacts.filter((c) => when(c.created_at) >= since && /open house|import|upload|sign-in/i.test(c.source ?? "")).length;
  if (imported) did.push({ id: "imp", text: `Added ${plural(imported, "contact")} from your sheet`, at: now.toISOString(), ms: now.getTime() - 1, href: "/contacts" });
  for (const p of posts.filter((x) => x.status === "published" && x.posted_at && when(x.posted_at) >= since)) did.push({ id: `po-${p.id}`, text: `Marked a ${p.platform} post as posted`, at: p.posted_at!, ms: when(p.posted_at!), href: "/content?tab=posted" });
  did.sort((a, b) => b.ms - a.ms);

  // ------------------------------------------------------------------ coming up
  const propById = new Map(props.map((p) => [p.id, p]));
  const next = events.filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > now.getTime() && new Date(e.start_at).getTime() < now.getTime() + 2 * DAY_MS)
    .sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 3)
    .map((e): UpItem => ({ id: e.id, time: fmtTime(e.start_at, tz), day: relativeDays(e.start_at, now, tz), title: e.title, place: e.property_id ? propById.get(e.property_id)?.address ?? e.location : e.location, href: "/calendar" }));

  // ------------------------------------------------------------------ today's plan (recommendations, ≤5)
  const plan: PlanItem[] = [];
  const dayEnd = new Date(startOfDay(now, tz).getTime() + DAY_MS);
  const tomorrowEnd = new Date(dayEnd.getTime() + DAY_MS);
  const inDay = (iso: string, end: Date) => { const t = new Date(iso).getTime(); return t >= now.getTime() - 3_600_000 && t < end.getTime(); };
  for (const e of events.filter((x) => x.status === "confirmed" && inDay(x.start_at, tomorrowEnd) && x.contact_id).slice(0, 2)) {
    const c = cById.get(e.contact_id!);
    if (c) plan.push({ id: `cf-${e.id}`, title: `Confirm with ${firstName(c.name)}`, why: `${e.title.split(/[—,]/)[0].trim()} · ${relativeDays(e.start_at, now, tz)} ${fmtTime(e.start_at, tz)}`, action: { label: "Draft confirmation", href: ask(`Draft a confirmation message to ${c.name} for ${e.title}`) } });
  }
  for (const e of events.filter((x) => x.status === "confirmed" && x.kind === "open_house" && x.property_id && new Date(x.start_at) > now && new Date(x.start_at).getTime() < now.getTime() + 3 * DAY_MS).slice(0, 1)) {
    if (!images.some((i) => i.property_id === e.property_id)) plan.push({ id: `ph-${e.id}`, title: "Add photos for your open house", why: `${propById.get(e.property_id!)?.address ?? "The listing"} has no photos yet.`, action: { label: "Pull photos", href: `/properties/${e.property_id}` } });
  }
  const dueToday = posts.filter((p) => p.status === "scheduled" && p.scheduled_for && inDay(p.scheduled_for, dayEnd));
  if (dueToday.length) plan.push({ id: "post-today", title: `Post ${plural(dueToday.length, "scheduled post")} today`, why: "Mila reminds you at the scheduled time.", action: { label: "Open posts", href: "/content?tab=scheduled" } });
  const dueRem = reminders.filter((r) => r.status === "pending" && inDay(r.remind_at, dayEnd)).sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  if (dueRem.length) plan.push({ id: `rm-${dueRem[0].id}`, title: dueRem[0].title, why: `Reminder at ${fmtTime(dueRem[0].remind_at, tz)}${dueRem.length > 1 ? ` · +${dueRem.length - 1} more today` : ""}`, action: { label: "Calendar", href: "/calendar" } });
  const fresh = contacts.filter((c) => c.status === "new" && !c.last_contact_at && now.getTime() - new Date(c.created_at).getTime() < 7 * DAY_MS).slice(0, 1);
  for (const c of fresh) plan.push({ id: `nl-${c.id}`, title: `Say hello to ${firstName(c.name)}`, why: "New lead — nobody has reached out yet.", action: { label: "Draft intro", href: ask(`Draft a first message to ${c.name}`) } });
  const upcomingPosts = posts.some((p) => ["scheduled", "approved_unpublished", "draft", "pending_approval"].includes(p.status) && (p.status !== "scheduled" || (p.scheduled_for && new Date(p.scheduled_for).getTime() < now.getTime() + 7 * DAY_MS)));
  if (!upcomingPosts) plan.push({ id: "plan-content", title: "Plan this week's content", why: "Nothing is lined up for the next 7 days.", action: { label: "Plan with Mila", href: "/content?plan=1" } });
  if (plan.length === 0) plan.push({ id: "ask-day", title: "Ask Mila what to focus on", why: "Nothing urgent — a good day to build your pipeline.", action: { label: "Ask Mila", href: ask("Who should I follow up with today?") } });

  const n = needs.length;
  const summary = n === 0 ? "You're all caught up. Mila has the rest handled." : n === 1 ? "1 thing needs you. Everything else is handled." : `${n} things need you. Everything else is handled.`;
  void fmtDay;
  return { summary, plan: plan.slice(0, 5), updatedAt: now.toISOString(), needsYou, needsTotal: n, did: did.slice(0, 4).map(({ ms, ...d }) => { void ms; return d; }), next };
}
