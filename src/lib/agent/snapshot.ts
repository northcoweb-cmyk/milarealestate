import { fmtDayTime } from "../time";
import type { Ctx } from "./context";
import { fullMoney } from "./context";

/** A compact, factual picture of the agent's business right now — what a great human assistant would have in their head. */
export async function businessSnapshot(ctx: Ctx): Promise<string> {
  const [events, tasks, contacts, props] = await Promise.all([
    ctx.store.list("calendar_events", ctx.userId), ctx.store.list("tasks", ctx.userId), ctx.store.list("contacts", ctx.userId), ctx.store.list("properties", ctx.userId),
  ]);
  const now = ctx.now.getTime();
  const out: string[] = [`Today is ${fmtDayTime(ctx.now, ctx.tz)} (${ctx.tz}).`];
  const soon = events.filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > now && new Date(e.start_at).getTime() < now + 10 * 86_400_000).sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 10);
  out.push(soon.length ? `Next 10 days: ${soon.map((e) => `${e.title} (${fmtDayTime(e.start_at, ctx.tz)})`).join("; ")}.` : "Nothing on the calendar for the next 10 days.");
  const open = tasks.filter((t) => t.status === "open").sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9")).slice(0, 8);
  if (open.length) out.push(`Open tasks: ${open.map((t) => `${t.title}${t.due_at ? ` (due ${fmtDayTime(t.due_at, ctx.tz)})` : ""}`).join("; ")}.`);
  const live = props.filter((p) => !p.is_demo || true).slice(0, 8);
  if (live.length) out.push(`Listings/properties: ${live.map((p) => `${p.address}${p.city ? `, ${p.city}` : ""}${p.list_price ? ` ${fullMoney(p.list_price)}` : ""}${p.beds ? ` ${p.beds}bd` : ""}${p.baths ? `/${p.baths}ba` : ""}`).join("; ")}.`);
  const quiet = contacts.filter((c) => c.status !== "inactive" && c.status !== "closed" as string).map((c) => ({ c, days: c.last_contact_at ? Math.floor((now - new Date(c.last_contact_at).getTime()) / 86_400_000) : 999 })).filter((x) => x.days >= 7).sort((a, b) => b.c.importance - a.c.importance || b.days - a.days).slice(0, 5);
  if (quiet.length) out.push(`Clients going quiet: ${quiet.map((x) => `${x.c.name} (${x.c.type}${x.days < 999 ? `, ${x.days}d since contact` : ", never contacted"})`).join("; ")}.`);
  out.push(`${contacts.length} contacts total.`);
  return out.join("\n");
}
