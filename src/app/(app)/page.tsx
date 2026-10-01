import { requireProfile } from "@/lib/auth";
import { buildCtx } from "@/lib/agent/engine";
import { buildDebrief, greetingFor } from "@/lib/agent/debrief";
import { fmtShortDate, fmtTime } from "@/lib/time";
import { HomeClient, type HomeData } from "@/components/home-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await requireProfile();
  const ctx = await buildCtx(profile);
  const d = await buildDebrief(ctx);
  const events = (await ctx.store.list("calendar_events", profile.id))
    .filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > ctx.now.getTime() && new Date(e.start_at).getTime() < ctx.now.getTime() + 40 * 3_600_000)
    .sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 4);
  const approvals = (await ctx.store.list("approvals", profile.id)).filter((a) => a.status === "pending");
  const attention = d.priorities.filter((p) => p.source !== "event" && p.kind !== "approval").slice(0, 3);
  const data: HomeData = {
    greeting: greetingFor(ctx.now, ctx.tz, profile.full_name),
    firstName: profile.full_name.split(" ")[0],
    dateLine: new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, weekday: "long", month: "long", day: "numeric" }).format(ctx.now),
    attention: attention.map((a) => ({ id: a.id, title: a.title, subtitle: a.subtitle ?? null, reason: a.reason || null, href: a.contactId ? `/contacts/${a.contactId}` : "/tasks", priority: a.priority })),
    events: events.map((e) => ({ id: e.id, title: e.title, time: fmtTime(e.start_at, ctx.tz), day: new Date(e.start_at).getTime() - ctx.now.getTime() > 0 && fmtShortDate(e.start_at, ctx.tz) !== fmtShortDate(ctx.now, ctx.tz) ? "Tomorrow" : "Today", where: e.location })),
    approvals: approvals.slice(0, 3).map((a) => ({ id: a.id, title: a.title, summary: a.summary })),
    approvalCount: approvals.length,
    noticed: d.noticed,
    counts: d.counts,
    isDemo: profile.is_demo,
  };
  return <HomeClient data={data} />;
}
