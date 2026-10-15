import type { CalendarEvent, Contact } from "../../types";
import { fmtDay, fmtDayTime, fmtTime, zonedToUtc, partsIn } from "../../time";
import type { Ctx } from "../context";
import { persistState } from "../conversation";
import { mentionedContacts } from "./contacts";
import { ambiguousFirstName, askWhichPerson } from "./entity";
import { eventCard, upcomingEvents } from "./calendar";
import { type HandlerOut, reply } from "./types";

const OOO = /out of office|\(all day\)|time off|vacation|away/i;

async function whoIsIt(ctx: Ctx, text: string): Promise<Contact | HandlerOut | null> {
  const found = await mentionedContacts(ctx, text);
  const amb = ambiguousFirstName(text, found); if (amb) return askWhichPerson(text, amb);
  if (found.length >= 1) return found[0];
  const id = ctx.state.last_contact_ids?.[0];
  return id ? (await ctx.store.get("contacts", ctx.userId, id)) ?? null : null;
}
const isOut = (x: Contact | HandlerOut | null): x is HandlerOut => !!x && "text" in x;

export async function upcomingWith(ctx: Ctx, c: Contact): Promise<CalendarEvent[]> {
  const first = c.name.split(/\s+/)[0].toLowerCase();
  return (await upcomingEvents(ctx)).filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > ctx.now.getTime() && (e.contact_id === c.id || e.title.toLowerCase().includes(c.name.toLowerCase()) || (e.kind !== "other" && new RegExp(`\\b${first}\\b`, "i").test(e.title))));
}

/** "Maya signed with another realtor": she is out of the pipeline and the follow-ups, her showings are offered for cancelling, nothing is deleted. */
export async function clientLostHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const c = await whoIsIt(ctx, text);
  if (isOut(c)) return c;
  if (!c) return reply("Who was it? Tell me the client's name and I'll take them off your active list and pause their follow-ups.");
  const first = c.name.split(/\s+/)[0];
  const day = fmtDay(ctx.now, ctx.tz);
  await ctx.store.update("contacts", ctx.userId, c.id, { status: "inactive", tags: [...new Set([...(c.tags ?? []), "went with another agent"])], notes: `${c.notes ? c.notes + "\n" : ""}${day}: went with another agent.` } as never);
  await ctx.store.insert("contact_events", ctx.userId, { contact_id: c.id, kind: "note", title: "Went with another agent", body: text.slice(0, 400), occurred_at: ctx.now.toISOString() } as never).catch(() => null);
  ctx.state.last_contact_ids = [c.id]; await persistState(ctx);
  const evs = await upcomingWith(ctx, c);
  const head = `Sorry to hear it. I took ${first} off your active clients (marked "went with another agent"), so she won't show up in your follow-ups or priorities. Nothing was deleted. Say "make ${first} active" if she comes back.`;
  if (!evs.length) return reply(head);
  return reply(`${head} She still has ${evs.length === 1 ? "1 event" : `${evs.length} events`} on your calendar.`, [
    ...evs.slice(0, 4).map((e) => eventCard(ctx, e, "Still booked")),
    { type: "choice", title: `Clear ${first}'s calendar?`, buttons: [{ label: `Cancel ${evs.length === 1 ? "it" : `all ${evs.length}`}`, style: "primary" as const, action: { type: "prompt" as const, text: `Cancel all my showings with ${c.name}` } }, { label: "Keep them", style: "secondary" as const, action: { type: "prompt" as const, text: "Keep them" } }] },
  ]);
}

/** "Remove Maya from my active clients": marks her inactive. It never deletes (deleting has its own confirmed command). */
export async function deactivateContactHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const c = await whoIsIt(ctx, text);
  if (isOut(c)) return c;
  if (!c) return reply("Which client should I take off your active list?");
  await ctx.store.update("contacts", ctx.userId, c.id, { status: "inactive" } as never);
  ctx.state.last_contact_ids = [c.id]; await persistState(ctx);
  const evs = await upcomingWith(ctx, c);
  const first = c.name.split(/\s+/)[0];
  return reply(`${c.name} is off your active clients and out of your follow-ups. I didn't delete anything; say "delete ${first}" if you want them gone completely.${evs.length ? ` Heads up: ${first} still has ${evs.length} ${evs.length === 1 ? "event" : "events"} booked.` : ""}`, evs.length ? [{ type: "choice", title: `Clear ${first}'s calendar?`, buttons: [{ label: `Cancel ${evs.length === 1 ? "it" : `all ${evs.length}`}`, style: "primary" as const, action: { type: "prompt" as const, text: `Cancel all my showings with ${c.name}` } }, { label: "Keep them", style: "secondary" as const, action: { type: "prompt" as const, text: "Keep them" } }] }] : []);
}

/** The window the agent is away: the current or next out-of-office block. */
export async function awayWindow(ctx: Ctx): Promise<{ start: Date; end: Date; block: CalendarEvent } | null> {
  const blocks = (await upcomingEvents(ctx)).filter((e) => e.status === "confirmed" && e.kind === "other" && OOO.test(e.title) && new Date(e.end_at).getTime() > ctx.now.getTime());
  const b = blocks[0];
  return b ? { start: new Date(b.start_at), end: new Date(b.end_at), block: b } : null;
}

/** "What do I need to do before I leave?": everything that lands while the agent is away, and what is still open. */
export async function preDepartureHandler(ctx: Ctx): Promise<HandlerOut> {
  const w = await awayWindow(ctx);
  if (!w) return reply("I don't see time off on your calendar yet. Tell me when you'll be out, like \"I'm out of office Friday through Sunday\", and I'll make you a checklist.");
  const all = (await upcomingEvents(ctx)).filter((e) => e.id !== w.block.id && e.status === "confirmed");
  const during = all.filter((e) => new Date(e.start_at) < w.end && new Date(e.end_at) > w.start);
  const tasks = (await ctx.store.list("tasks", ctx.userId)).filter((t) => t.status === "open" && (!t.due_at || new Date(t.due_at) < w.end));
  const approvals = (await ctx.store.list("approvals", ctx.userId)).filter((a) => a.status === "pending");
  const rems = (await ctx.store.list("reminders", ctx.userId)).filter((r) => r.status === "pending" && new Date(r.remind_at) >= w.start && new Date(r.remind_at) < w.end);
  const quiet = (await ctx.store.list("contacts", ctx.userId)).filter((c) => !["inactive", "closed"].includes(c.status) && (!c.last_contact_at || w.start.getTime() - new Date(c.last_contact_at).getTime() > 10 * 86_400_000)).slice(0, 3);
  const when = `${fmtDay(w.start, ctx.tz)} to ${fmtDay(w.end, ctx.tz)}`;
  const items: string[] = [];
  if (during.length) items.push(`${during.length} ${during.length === 1 ? "event is" : "events are"} booked while you're away. Move or cancel ${during.length === 1 ? "it" : "them"}.`);
  if (approvals.length) items.push(`${approvals.length} ${approvals.length === 1 ? "thing is" : "things are"} waiting for your approval (drafts, sends), so approve or clear them first.`);
  if (tasks.length) items.push(`${tasks.length} open ${tasks.length === 1 ? "task" : "tasks"} due before you're back.`);
  if (rems.length) items.push(`${rems.length} ${rems.length === 1 ? "reminder fires" : "reminders fire"} while you're away.`);
  if (quiet.length) items.push(`Check in with ${quiet.map((c) => c.name.split(/\s+/)[0]).join(", ")} before you go; they've gone quiet.`);
  items.push("Set an out-of-office email so clients know who to reach.");
  const first = during[0];
  return reply(`Before you're out (${when}), here's what I'd handle:\n${items.map((x, i) => `${i + 1}. ${x}`).join("\n")}`, [
    ...during.slice(0, 4).map((e) => eventCard(ctx, e, "Booked while you're away")),
    { type: "choice", title: "Want me to…", buttons: [
      ...(during.length ? [{ label: during.length === 1 ? "Move it to the day I'm back" : `Move all ${during.length} to the day I'm back`, style: "primary" as const, action: { type: "shift_events", eventIds: during.map((e) => e.id), after: w.end.toISOString() } as never }] : []),
      { label: "Draft my out-of-office email", style: "secondary" as const, action: { type: "prompt" as const, text: `Draft an out-of-office email for ${when}` } },
      { label: "What's still open", style: "secondary" as const, action: { type: "prompt" as const, text: "What are my priorities?" } },
    ] },
  ].filter((b) => !(b.type === "choice" && !(b as { buttons: unknown[] }).buttons.length)) as never);
  void first; void fmtDayTime; void fmtTime; void zonedToUtc; void partsIn;
}
