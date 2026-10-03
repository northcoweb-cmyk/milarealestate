import { fmtDay, fmtDayTime, fmtRange, fmtTime, partsIn, zonedToUtc } from "../../time";
import type { Block, CalendarEvent, EmailDraft, Property, SocialPost } from "../../types";
import type { Ctx } from "../context";
import { label, plural } from "../context";
import { persistState } from "../conversation";
import { openHouseEmail, openHouseSocial, polish } from "../comms";
import { capitalisedNames, parseAddress, parseWhen } from "../nlu";
import { TOOLS, eventConflicts, freeSlots, invoke, logContactEvent } from "../tools";
import { type HandlerOut, reply } from "./types";
import { askBack } from "./ask";

const KIND_WORDS: [RegExp, CalendarEvent["kind"]][] = [
  [/open house/i, "open_house"], [/showing|tour/i, "showing"], [/lunch|dinner|coffee/i, "lunch"], [/closing/i, "closing"], [/call/i, "call"], [/meeting|appointment/i, "meeting"],
];

export async function upcomingEvents(ctx: Ctx) {
  const cutoff = ctx.now.getTime() - 12 * 3_600_000;
  return (await ctx.store.list("calendar_events", ctx.userId))
    .filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > cutoff)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function eventCard(ctx: Ctx, e: CalendarEvent, status?: string): Block {
  return { type: "event", eventId: e.id, title: e.title, when: `${fmtDayTime(e.start_at, ctx.tz)} – ${fmtTime(e.end_at, ctx.tz)}`, where: e.location ?? undefined, status };
}

/** Find which existing event the user is talking about. */
export async function resolveEvent(ctx: Ctx, text: string): Promise<{ event?: CalendarEvent; candidates: CalendarEvent[] }> {
  const events = await upcomingEvents(ctx);
  let c = events;
  const kind = KIND_WORDS.find(([re]) => re.test(text))?.[1];
  if (kind) c = c.filter((e) => e.kind === kind);
  const addr = parseAddress(text);
  if (addr) {
    const byAddr = c.filter((e) => `${e.title} ${e.location ?? ""}`.toLowerCase().includes(addr.toLowerCase()));
    if (byAddr.length) c = byAddr;
  }
  const names = capitalisedNames(text).map((n) => n.toLowerCase());
  if (names.length) {
    const contacts = await ctx.store.list("contacts", ctx.userId);
    const ids = contacts.filter((x) => names.some((n) => x.name.toLowerCase().startsWith(n.split(" ")[0]))).map((x) => x.id);
    const byName = c.filter((e) => (e.contact_id && ids.includes(e.contact_id)) || names.some((n) => e.title.toLowerCase().includes(n.split(" ")[0])));
    if (byName.length) c = byName;
  }
  if (c.length === 1) return { event: c[0], candidates: c };
  const last = ctx.state.last_event_id && c.find((e) => e.id === ctx.state.last_event_id);
  if (last && (kind || addr)) return { event: last, candidates: c };
  if (last && c.length > 1 && !kind && !addr && !names.length) return { event: last, candidates: c };
  // several of the same kind: prefer one in the near future only if exactly one is within 7 days
  const soon = c.filter((e) => new Date(e.start_at).getTime() - ctx.now.getTime() < 7 * 86_400_000);
  if (kind && soon.length === 1) return { event: soon[0], candidates: c };
  return { candidates: c };
}

function computeNewTimes(ctx: Ctx, ev: CalendarEvent, text: string): { start: Date; end: Date } | null {
  const w = parseWhen(text, ctx.now, ctx.tz);
  if (!w.date && !w.time) return null;
  const cur = partsIn(new Date(ev.start_at), ctx.tz);
  const dur = new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime();
  const d = w.date ?? { y: cur.y, m: cur.m, d: cur.d };
  const t = w.time?.start ?? { h: cur.h, mi: cur.mi };
  const start = zonedToUtc(d.y, d.m, d.d, t.h, t.mi, ctx.tz);
  const end = w.time?.end ? zonedToUtc(d.y, d.m, d.d, w.time.end.h, w.time.end.mi, ctx.tz) : new Date(start.getTime() + dur);
  return { start, end };
}

/** "Move my open house to Sunday" / "I moved the open house to Saturday at 2" */
export async function moveEventHandler(ctx: Ctx, text: string, declared: boolean): Promise<HandlerOut> {
  const { event, candidates } = await resolveEvent(ctx, text);
  if (!event) {
    if (!candidates.length) return reply("I don't see anything on your calendar that matches. Tell me which event, or ask me to create it.");
    return reply("Which one?", [{
      type: "choice", title: "Which event do you mean?",
      buttons: candidates.slice(0, 5).map((e) => ({ label: `${e.title} · ${fmtDayTime(e.start_at, ctx.tz)}`, style: "secondary" as const, action: { type: "move_pick", eventId: e.id, text, declared } })),
    }]);
  }
  const times = computeNewTimes(ctx, event, text);
  if (!times) return reply(`When should I move ${event.title}? You can say something like "Saturday at 2".`);
  return applyMove(ctx, event, times.start, times.end, declared, false);
}

export async function applyMove(ctx: Ctx, event: CalendarEvent, start: Date, end: Date, declared: boolean, ignoreConflicts: boolean): Promise<HandlerOut> {
  if (!declared && start.getTime() < ctx.now.getTime() - 60_000) return reply(`${fmtDayTime(start, ctx.tz)} has already passed, so I haven't moved anything. What other time works?`);
  ctx.steps.push("Checking your calendar");
  const conflicts = ignoreConflicts ? [] : await eventConflicts(ctx, start.toISOString(), end.toISOString(), event.id);
  if (conflicts.length) {
    const c = conflicts[0];
    return reply(`That time overlaps ${c.title}.`, [{
      type: "choice", title: `${c.title} is already scheduled ${fmtDayTime(c.start_at, ctx.tz)}`,
      body: `Moving ${event.title} to ${fmtDayTime(start, ctx.tz)} would overlap it.`,
      buttons: [
        { label: "Move it anyway", style: "primary", action: { type: "move_apply", eventId: event.id, start: start.toISOString(), end: end.toISOString(), declared, ignoreConflicts: true } },
        { label: "Find another time", style: "secondary", action: { type: "find_time", eventId: event.id, durationMin: Math.round((end.getTime() - start.getTime()) / 60000) } },
        { label: `Keep ${event.title} where it is`, style: "quiet", action: { type: "noop" } },
      ],
    }]);
  }
  const out = await invoke(ctx, "update_calendar_event", { id: event.id, start_at: start.toISOString(), end_at: end.toISOString(), declared });
  ctx.state.last_event_id = event.id;
  if (out.status === "needs_approval") {
    await persistState(ctx);
    return reply("This will change your calendar, so I need a yes first.", [{
      type: "notice", tone: "info", title: `Move ${event.title}`,
      body: `${fmtDayTime(event.start_at, ctx.tz)} → ${fmtDayTime(start, ctx.tz)}`,
      buttons: [{ label: "Confirm change", style: "primary", approvalId: out.approval.id }, { label: "Review tasks", style: "quiet", href: "/tasks" }],
    }]);
  }
  if (!out.result.ok) return reply(`I couldn't move it: ${out.result.message}`, [{ type: "notice", tone: "error", title: "Calendar wasn't changed", body: out.result.message }]);
  const data = out.result.data as { event: CalendarEvent; before: CalendarEvent; syncNote?: string };
  const stale = await markCommsStale(ctx, data.before, data.event);
  return reply(`Moved to ${fmtDay(data.event.start_at, ctx.tz)} at ${fmtTime(data.event.start_at, ctx.tz)}.`, [
    eventCard(ctx, data.event, "Updated"),
    ...(data.syncNote ? [{ type: "notice", tone: "warn", title: data.syncNote } as Block] : []),
    ...stale,
  ]);
}

const when = (ctx: Ctx, iso: string) => `${fmtDay(iso, ctx.tz)}`;

/** After a time change, flag related drafts and ask whether to update them. */
export async function markCommsStale(ctx: Ctx, before: CalendarEvent, after: CalendarEvent): Promise<Block[]> {
  if (before.start_at === after.start_at && before.end_at === after.end_at) return [];
  const [emails, posts] = await Promise.all([ctx.store.list("email_drafts", ctx.userId), ctx.store.list("social_posts", ctx.userId)]);
  const rel = (x: { event_id: string | null }) => x.event_id === after.id;
  const reason = `Written for ${fmtDayTime(before.start_at, ctx.tz)}`;
  const mail = emails.filter(rel), soc = posts.filter(rel);
  if (!mail.length && !soc.length) return [];
  for (const m of mail) await ctx.store.update("email_drafts", ctx.userId, m.id, { stale: true, stale_reason: reason });
  for (const p of soc) await ctx.store.update("social_posts", ctx.userId, p.id, { stale: true, stale_reason: reason });
  ctx.state.pending = { kind: "stale_comms", event_id: after.id, email_ids: mail.map((m) => m.id), social_ids: soc.map((p) => p.id) };
  await persistState(ctx);
  const what = [mail.length ? (mail.length === 1 ? "email" : "emails") : null, soc.length ? (soc.length === 1 ? "social post" : "social posts") : null].filter(Boolean).join(" and ");
  const sent = mail.filter((m) => m.status === "sent").length;
  return [{
    type: "choice",
    title: `Your current ${what} mention ${when(ctx, before.start_at)}.`,
    body: sent ? `${plural(sent, "email")} already went out, so I'd prepare a short correction for those. Do you want me to update everything?` : "Do you want me to update them?",
    buttons: [
      { label: "Update everything", style: "primary", action: { type: "stale_comms", choice: "update", eventId: after.id } },
      { label: "Leave communications unchanged", style: "secondary", action: { type: "stale_comms", choice: "leave", eventId: after.id } },
    ],
  }];
}

export async function resolveStale(ctx: Ctx, eventId: string, choice: "update" | "leave"): Promise<HandlerOut> {
  const pending = ctx.state.pending?.kind === "stale_comms" ? ctx.state.pending : null;
  ctx.state.pending = null;
  await persistState(ctx);
  const ev = await ctx.store.get("calendar_events", ctx.userId, eventId);
  const emails = (await ctx.store.list("email_drafts", ctx.userId)).filter((m) => m.event_id === eventId && m.stale);
  const posts = (await ctx.store.list("social_posts", ctx.userId)).filter((m) => m.event_id === eventId && m.stale);
  void pending;
  if (!ev) return reply("I couldn't find that event anymore.");
  if (choice === "leave") {
    for (const m of emails) await ctx.store.update("email_drafts", ctx.userId, m.id, { stale: false, stale_reason: null });
    for (const p of posts) await ctx.store.update("social_posts", ctx.userId, p.id, { stale: false, stale_reason: null });
    return reply("Okay, I left them as they are.");
  }
  const refreshed = await refreshComms(ctx, ev);
  return reply(refreshed.summary, refreshed.blocks);
}

/** Rewrite unsent drafts for the event's new time; draft a correction for emails already sent. */
export async function refreshComms(ctx: Ctx, ev: CalendarEvent) {
  ctx.steps.push("Updating drafts");
  const prop = ev.property_id ? await ctx.store.get("properties", ctx.userId, ev.property_id) : null;
  const start = new Date(ev.start_at), end = new Date(ev.end_at);
  const emails = (await ctx.store.list("email_drafts", ctx.userId)).filter((m) => m.event_id === ev.id);
  const posts = (await ctx.store.list("social_posts", ctx.userId)).filter((m) => m.event_id === ev.id);
  const blocks: Block[] = [];
  const done: string[] = [];
  for (const m of emails) {
    if (m.status === "sent") {
      if (!prop) continue;
      const corr = await TOOLS.draft_email.run(ctx, {
        to_contact_ids: m.to_contact_ids, to_emails: m.to_emails, subject: `Updated time — Open House at ${prop.address}`, property_id: prop.id, event_id: ev.id, workflow_run_id: m.workflow_run_id,
        body: `Hi {{first_name}},\n\nA quick update: the open house at ${prop.address} has moved to ${fmtDay(start, ctx.tz)}, ${fmtRange(start, end, ctx.tz)}. Sorry for any confusion, and I hope to see you there.\n\n${ctx.profile.full_name}`,
      });
      if (corr.ok) {
        const d = (corr.data as { draft: EmailDraft }).draft;
        const out = await invoke(ctx, "send_email", { draftId: d.id }, { runId: m.workflow_run_id });
        if (out.status === "needs_approval") { await ctx.store.update("email_drafts", ctx.userId, d.id, { status: "pending_approval" }); done.push("a correction email (waiting for your approval)"); }
      }
      continue;
    }
    if (!prop) continue;
    const t = openHouseEmail(ctx, prop, start, end);
    await ctx.store.update("email_drafts", ctx.userId, m.id, { subject: t.subject, body: await polish(ctx, "email", t.body), stale: false, stale_reason: null });
    done.push("the email");
  }
  for (const p of posts) {
    if (!prop) continue;
    const imgs = (await ctx.store.list("property_images", ctx.userId)).filter((i) => i.property_id === prop.id).sort((a, b) => a.position - b.position).map((i) => i.id);
    const s = openHouseSocial(ctx, prop, start, end, imgs);
    await ctx.store.update("social_posts", ctx.userId, p.id, { caption: s.caption, slides: s.slides, hashtags: s.hashtags, stale: false, stale_reason: null });
    done.push("the social post");
  }
  const unique = [...new Set(done)];
  return { summary: unique.length ? `Updated ${unique.join(" and ")} for ${fmtDay(start, ctx.tz)} at ${fmtTime(start, ctx.tz)}.` : "Nothing needed updating.", blocks };
}

/** "Schedule a showing at 1 PM" — always checks the calendar first. */
export async function createEventHandler(ctx: Ctx, text: string, kindHint?: CalendarEvent["kind"], title?: string, contactId?: string | null, propertyId?: string | null): Promise<HandlerOut> {
  const w = parseWhen(text, ctx.now, ctx.tz);
  const kind = kindHint ?? KIND_WORDS.find(([re]) => re.test(text))?.[1] ?? "meeting";
  if (!w.time && !w.date) return askBack(ctx, "create_event", text, "date", "What day and time works?");
  let start = w.start!;
  if (!w.date) {
    // time only → today if still ahead, otherwise tomorrow
    const p = partsIn(ctx.now, ctx.tz);
    start = zonedToUtc(p.y, p.m, p.d, w.time!.start.h, w.time!.start.mi, ctx.tz);
    if (start.getTime() <= ctx.now.getTime()) start = new Date(start.getTime() + 86_400_000);
  } else if (!w.time) {
    return askBack(ctx, "create_event", text, "time", `What time on ${fmtDay(start, ctx.tz)}?`);
  }
  if (start.getTime() < ctx.now.getTime() - 60_000) return askBack(ctx, "create_event", text, "time", `That time has already passed (${fmtDayTime(start, ctx.tz)}). What later time did you mean?`);
  const durMin = kind === "open_house" ? 120 : kind === "showing" ? 45 : kind === "lunch" ? 60 : 30;
  const end = w.end ?? new Date(start.getTime() + durMin * 60_000);
  const addr = parseAddress(text);
  const finalTitle = title ?? `${label(kind)}${addr ? ` — ${addr}` : ""}`;
  const args = { title: finalTitle, kind, start_at: start.toISOString(), end_at: end.toISOString(), location: addr, contact_id: contactId ?? null, property_id: propertyId ?? null };
  return scheduleWithConflictCheck(ctx, args);
}

export async function scheduleWithConflictCheck(ctx: Ctx, args: Record<string, any>, skipCheck = false): Promise<HandlerOut> {
  ctx.steps.push("Checking your calendar");
  const conflicts = skipCheck ? [] : await eventConflicts(ctx, args.start_at, args.end_at);
  if (conflicts.length) {
    const c = conflicts[0];
    ctx.state.pending = { kind: "calendar_conflict", draft: args, conflict_ids: conflicts.map((x) => x.id) };
    await persistState(ctx);
    return reply(`You already have ${c.title} at ${fmtTime(c.start_at, ctx.tz)}.`, [{
      type: "choice", title: `You already have ${c.title} scheduled ${fmtDayTime(c.start_at, ctx.tz)}.`,
      body: `Would you like me to:`,
      buttons: [
        { label: `Keep ${c.title.split(/[,—-]/)[0].trim()}`, style: "secondary", action: { type: "conflict", choice: "keep" } },
        { label: `Move ${c.title.split(/[,—-]/)[0].trim()}`, style: "secondary", action: { type: "conflict", choice: "move" } },
        { label: "Find another time", style: "primary", action: { type: "conflict", choice: "find" } },
      ],
    }]);
  }
  const out = await invoke(ctx, "create_calendar_event", { ...args, ignoreConflicts: skipCheck });
  if (out.status === "needs_approval") {
    return reply("Ready to add this to your calendar.", [{ type: "notice", tone: "info", title: out.approval.title, body: out.approval.summary ?? undefined, buttons: [{ label: "Add to calendar", style: "primary", approvalId: out.approval.id }] }]);
  }
  if (!out.result.ok) return reply(`I couldn't add it: ${out.result.message}`, [{ type: "notice", tone: "error", title: "Not added", body: out.result.message }]);
  const ev = (out.result.data as { event: CalendarEvent; syncNote?: string }).event;
  ctx.state.last_event_id = ev.id;
  await persistState(ctx);
  await logContactEvent(ctx, ev.contact_id, "calendar_added", `${ev.title} — ${fmtDayTime(ev.start_at, ctx.tz)}`);
  return reply(`Added: ${ev.title}, ${fmtDayTime(ev.start_at, ctx.tz)}.`, [eventCard(ctx, ev, "Added")]);
}

/** User answered a calendar conflict question. */
export async function resolveConflict(ctx: Ctx, choice: "keep" | "move" | "find"): Promise<HandlerOut> {
  const p = ctx.state.pending?.kind === "calendar_conflict" ? ctx.state.pending : null;
  if (!p) return reply("That question has already been answered.");
  const draft = p.draft as Record<string, any>;
  const conflict = await ctx.store.get("calendar_events", ctx.userId, p.conflict_ids[0]);
  const dur = new Date(draft.end_at).getTime() - new Date(draft.start_at).getTime();

  if (choice === "keep") {
    ctx.state.pending = null; await persistState(ctx);
    return reply(`Okay — I kept ${conflict?.title ?? "it"} and didn't add the new event.`);
  }
  if (choice === "find") {
    const slots = await freeSlots(ctx, new Date(draft.start_at), Math.round(dur / 60000), 3);
    if (!slots.length) return reply("I couldn't find an open slot in the next two weeks.");
    return reply("Here are the next open times.", [{
      type: "choice", title: "Pick a time", buttons: slots.map((s) => ({ label: fmtDayTime(s.start, ctx.tz), style: "secondary" as const, action: { type: "pick_slot", start: s.start.toISOString(), end: s.end.toISOString() } })),
    }]);
  }
  // move the existing event to the first free slot after the new one
  if (!conflict) return reply("I couldn't find the conflicting event anymore.");
  const slots = await freeSlots(ctx, new Date(draft.end_at), Math.round((new Date(conflict.end_at).getTime() - new Date(conflict.start_at).getTime()) / 60000), 1, conflict.id);
  if (!slots.length) return reply("I couldn't find an open slot to move it to.");
  const moveOut = await invoke(ctx, "update_calendar_event", { id: conflict.id, start_at: slots[0].start.toISOString(), end_at: slots[0].end.toISOString() });
  ctx.state.pending = null; await persistState(ctx);
  const blocks: Block[] = [];
  let text = "";
  if (moveOut.status === "needs_approval") {
    // The new event can't be placed until the old one actually moves; ask for approval first.
    blocks.push({ type: "notice", tone: "info", title: `Move ${conflict.title}`, body: `${fmtDayTime(conflict.start_at, ctx.tz)} → ${fmtDayTime(slots[0].start, ctx.tz)}. Once you confirm, say "schedule it" again and I'll add the new event.`, buttons: [{ label: "Confirm change", style: "primary", approvalId: moveOut.approval.id }] });
    text = "I'll need your OK to move it.";
    ctx.state.pending = null;
    return reply(text, blocks);
  }
  if (draft.__openHouse) {
    const { continueOpenHouse } = await import("./openhouse");
    const oh = await continueOpenHouse(ctx, draft, new Date(draft.start_at), new Date(draft.end_at));
    return reply(`Moved ${conflict.title} to ${fmtDayTime(slots[0].start, ctx.tz)}. ${oh.text}`, oh.blocks, oh.creditKey);
  }
  const placed = await scheduleWithConflictCheck(ctx, draft);
  return reply(`Moved ${conflict.title} to ${fmtDayTime(slots[0].start, ctx.tz)}. ${placed.text}`, placed.blocks);
}

export async function pickSlot(ctx: Ctx, start: string, end: string): Promise<HandlerOut> {
  const p = ctx.state.pending?.kind === "calendar_conflict" ? ctx.state.pending : null;
  const draft = (p?.draft ?? null) as Record<string, any> | null;
  ctx.state.pending = null; await persistState(ctx);
  if (!draft) return reply("Tell me what you'd like to schedule and I'll set it up.");
  if (draft.__openHouse) {
    const { continueOpenHouse } = await import("./openhouse");
    return continueOpenHouse(ctx, draft, new Date(start), new Date(end));
  }
  return scheduleWithConflictCheck(ctx, { ...draft, start_at: start, end_at: end });
}

export async function findTimeForEvent(ctx: Ctx, eventId: string, durationMin: number): Promise<HandlerOut> {
  const slots = await freeSlots(ctx, ctx.now, durationMin, 3, eventId);
  if (!slots.length) return reply("I couldn't find an open slot in the next two weeks.");
  return reply("Here are the next open times.", [{ type: "choice", title: "Pick a time", buttons: slots.map((s) => ({ label: fmtDayTime(s.start, ctx.tz), style: "secondary" as const, action: { type: "move_apply", eventId, start: s.start.toISOString(), end: s.end.toISOString(), declared: false, ignoreConflicts: false } })) }]);
}

export async function cancelEventHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  if (/\b(all|every|everything)\b/i.test(text)) {
    const upcoming = (await upcomingEvents(ctx)).filter((e) => new Date(e.end_at).getTime() > ctx.now.getTime());
    if (!upcoming.length) return reply("You don't have any upcoming events to cancel.");
    const out = await invoke(ctx, "cancel_calendar_event", { ids: upcoming.map((e) => e.id) });
    if (out.status === "needs_approval") return reply(`That would cancel ${upcoming.length} upcoming ${upcoming.length === 1 ? "event" : "events"}, so I need your OK.`, [{ type: "notice", tone: "warn", title: out.approval.title, body: out.approval.summary ?? undefined, buttons: [{ label: `Confirm — cancel ${upcoming.length}`, style: "primary", approvalId: out.approval.id }, { label: "Never mind", style: "quiet", action: { type: "noop" } }] }]);
    return reply(out.result.ok ? "Cancelled." : out.result.message);
  }
  const { event, candidates } = await resolveEvent(ctx, text);
  if (!event) return candidates.length ? reply("Which one should I cancel?", [{ type: "choice", title: "Which event?", buttons: candidates.slice(0, 5).map((e) => ({ label: `${e.title} · ${fmtDayTime(e.start_at, ctx.tz)}`, style: "secondary" as const, action: { type: "cancel_pick", eventId: e.id } })) }]) : reply("I don't see a matching event on your calendar.");
  return cancelEvent(ctx, event);
}
export async function cancelEvent(ctx: Ctx, event: CalendarEvent): Promise<HandlerOut> {
  const out = await invoke(ctx, "cancel_calendar_event", { id: event.id });
  if (out.status === "needs_approval") return reply("Cancelling always needs your confirmation.", [{ type: "notice", tone: "warn", title: out.approval.title, body: out.approval.summary ?? undefined, buttons: [{ label: "Confirm cancel", style: "primary", approvalId: out.approval.id }] }]);
  return reply(out.result.ok ? "Cancelled." : out.result.message);
}

export type { Property, SocialPost };
