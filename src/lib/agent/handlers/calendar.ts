import { resolveAddress } from "../property-lookup";
import { landmarkAsk } from "./location";
import { addDays, fmtDay, fmtDayTime, fmtRange, fmtShortDate, fmtTime, partsIn, startOfDay, zonedToUtc } from "../../time";
import type { Block, CalendarEvent, Contact, EmailDraft, Property, SocialPost } from "../../types";
import type { Ctx } from "../context";
import { firstName, label, plural } from "../context";
import { persistState } from "../conversation";
import { openHouseEmail, openHouseSocial, polish } from "../comms";
import { capitalisedNames, parseAddress, parseDate, parseWhen, rollPastWeekday } from "../nlu";
import { TOOLS, eventConflicts, freeSlots, invoke, logContactEvent } from "../tools";
import { type HandlerOut, reply } from "./types";
import { askBack } from "./ask";
import { resolveProperty } from "./listing";

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
  if (!addr) {
    // "the showing at 12 Oak" (no street suffix): match the street-name words against where each event is
    const words = new Set(text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/));
    const noise = new Set(["street", "st", "avenue", "ave", "road", "rd", "drive", "dr", "lane", "ln", "court", "ct", "way", "boulevard", "blvd", "place", "pl", "terrace", "circle", "cir", "n", "s", "e", "w", "ne", "nw", "se", "sw"]);
    const byLoc = c.filter((e) => { const name = (e.location ?? "").toLowerCase().split(/\s+/).slice(1).filter((w) => !noise.has(w) && !w.startsWith("#")); return name.length > 0 && name.every((w) => w.length >= 3 && words.has(w)); });
    if (byLoc.length) c = byLoc;
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

/** "push it back an hour", "move it up 30 min", "an hour earlier": a shift relative to where the event is now. */
function relativeShift(text: string): number | null {
  const m = /\b(\d+(?:\.\d+)?|an?|one|two|three|half an?|a half)\s*(hours?|hrs?|minutes?|mins?)\b/i.exec(text);
  if (!m) return null;
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, "half a": 0.5, "half an": 0.5, "a half": 0.5 };
  const n = words[m[1].toLowerCase()] ?? parseFloat(m[1]);
  if (!(n > 0)) return null;
  const mins = /^h/i.test(m[2]) ? n * 60 : n;
  const rest = text.replace(m[0], " ");
  if (/\b(earlier|sooner|up|before|forward)\b/i.test(rest)) return -mins;
  if (/\b(later|back|after|out|delay|ahead)\b/i.test(rest)) return mins;
  return null;
}

/** Where is it moving TO? "move my 9am showing to 4pm" must read 4pm, not the 9am it is leaving. */
function destinationOf(text: string, ctx: Ctx): string {
  const parts = text.split(/\b(?:to|until|till|for|into)\b|→|->/i);
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = /^\s*\d{1,2}(?::\d{2})?\s*[.!?]?\s*$/.test(parts[i]) ? `at ${parts[i].trim().replace(/[.!?]$/, "")}` : parts[i]; // "move it to 4": a bare number after "to" is a clock time
    const w = parseWhen(part, ctx.now, ctx.tz);
    if (w.start || w.time) return part;
  }
  return text;
}

function computeNewTimes(ctx: Ctx, ev: CalendarEvent, text: string): { start: Date; end: Date } | null {
  const dur = new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime();
  const dest = destinationOf(text, ctx);
  const w = parseWhen(dest, ctx.now, ctx.tz);
  if (!w.date && !w.time) {
    const shift = relativeShift(text);
    if (shift == null) return null;
    const start = new Date(new Date(ev.start_at).getTime() + shift * 60_000);
    return { start, end: new Date(start.getTime() + dur) };
  }
  const cur = partsIn(new Date(ev.start_at), ctx.tz);
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
  const out = await invoke(ctx, "update_calendar_event", { id: event.id, start_at: start.toISOString(), end_at: end.toISOString(), declared, requested: true });
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
  if (data.before.start_at !== data.event.start_at || data.before.end_at !== data.event.end_at) ctx.state.last_action = { type: "move", event_id: data.event.id, start_at: data.before.start_at, end_at: data.before.end_at };
  const stale = await markCommsStale(ctx, data.before, data.event);
  return reply(`Moved to ${fmtDay(data.event.start_at, ctx.tz)} at ${fmtTime(data.event.start_at, ctx.tz)}.`, [
    eventCard(ctx, data.event, "Updated"),
    ...(data.syncNote ? [{ type: "notice", tone: "warn", title: data.syncNote } as Block] : []),
    ...stale,
    ...(data.before.start_at !== data.event.start_at ? [{ type: "choice", title: "Wrong?", buttons: [{ label: `Undo — back to ${fmtDayTime(data.before.start_at, ctx.tz)}`, style: "quiet", action: { type: "move_apply", eventId: data.event.id, start: data.before.start_at, end: data.before.end_at, declared: true, ignoreConflicts: true } }] } as Block] : []),
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
    const s = await openHouseSocial(ctx, prop, start, end, imgs);
    await ctx.store.update("social_posts", ctx.userId, p.id, { caption: s.caption, slides: s.slides, hashtags: s.hashtags, stale: false, stale_reason: null });
    done.push("the social post");
  }
  const unique = [...new Set(done)];
  return { summary: unique.length ? `Updated ${unique.join(" and ")} for ${fmtDay(start, ctx.tz)} at ${fmtTime(start, ctx.tz)}.` : "Nothing needed updating.", blocks };
}

/** "Schedule a showing at 1 PM" — always checks the calendar first. */
export async function createEventHandler(ctx: Ctx, text: string, kindHint?: CalendarEvent["kind"], title?: string, contactId?: string | null, propertyId?: string | null): Promise<HandlerOut> {
  const w = parseWhen(text, ctx.now, ctx.tz);
  const noun = /\b(inspection|walk-?through|consult(?:ation)?|appointment|dinner|coffee|breakfast|closing|lunch|call|meeting|showing|tour)\b/i.exec(text)?.[1];
  const kind = kindHint ?? KIND_WORDS.find(([re]) => re.test(text))?.[1] ?? "meeting";
  if (!w.time && !w.date) return askBack(ctx, "create_event", text, "date", "What day and time works?");
  if (!kindHint && !title && !noun && !/open house/i.test(text)) {
    const day = w.date ? ` on ${fmtDay(w.start!, ctx.tz)}` : "";
    return askBack(ctx, "create_event", text, "kind", `What should I put on your calendar${day}${w.time ? "" : ", and at what time"} (a showing, call, meeting…)?`);
  }
  let start = w.start!;
  if (!w.date) {
    // time only → today if still ahead, otherwise tomorrow
    const p = partsIn(ctx.now, ctx.tz);
    start = zonedToUtc(p.y, p.m, p.d, w.time!.start.h, w.time!.start.mi, ctx.tz);
    if (start.getTime() <= ctx.now.getTime()) start = new Date(start.getTime() + 86_400_000);
  } else if (!w.time) {
    return askBack(ctx, "create_event", text, "time", `What time on ${fmtDay(start, ctx.tz)}?`);
  }
  start = rollPastWeekday(start, text, ctx.now, ctx.tz);
  const endNow = w.end ?? new Date(start.getTime() + (kind === "open_house" ? 120 : kind === "showing" ? 45 : kind === "lunch" ? 60 : 30) * 60_000);
  if (start.getTime() < ctx.now.getTime() - 60_000 && endNow.getTime() <= ctx.now.getTime()) return askBack(ctx, "create_event", text, "time", `That time has already passed (${fmtDayTime(start, ctx.tz)}). What later time did you mean?`);
  const durMin = kind === "open_house" ? 120 : kind === "showing" ? 45 : kind === "lunch" ? 60 : 30;
  const end = w.end ?? new Date(start.getTime() + durMin * 60_000);
  const addr = parseAddress(text);
  let prop = propertyId === undefined && addr && ["showing", "open_house", "inspection"].includes(kind) ? await resolveProperty(ctx, text, false) : null;
  // a showing or inspection at an address means that home belongs in the Properties tab: save it (with the city and state if they were said)
  if (!prop && propertyId === undefined && addr && ["showing", "inspection"].includes(kind)) {
    const r = await resolveAddress(ctx, text, addr, { answering: false }).catch(() => null);
    const loc = r && r.status === "ok" ? r.place : null;
    const lm = landmarkAsk(text, addr, loc?.landmark ?? null); // a ballpark or a capitol is not someone's home: ask before booking it
    if (lm) return lm;
    const made = (await TOOLS.create_property.run(ctx, { address: addr, city: loc?.city ?? null, state: loc?.state ?? null, zip: loc?.zip ?? null, county: null, list_price: null, beds: null, baths: null, sqft: null })) as any;
    prop = (made?.data?.property as Property | undefined) ?? null;
  }
  if (prop) ctx.state.last_property_id = prop.id;
  const nounTitle = noun && /^(inspection|walk-?through|consult|consultation|dinner|coffee|breakfast)$/i.test(noun) ? noun.charAt(0).toUpperCase() + noun.slice(1).toLowerCase() : null;
  // "call with Dana", "lunch with Mary-Kate O'Neil": keep who it's with, and link a saved contact
  const notName = /^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|january|february|march|april|may|june|july|august|september|october|november|december|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|today|tomorrow|tonight|at|on|for|and|about|next|this|a|an|the)$/i;
  const rawWho0 = /\b(?:with|for|to)\s+((?:the\s+)?\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})/u.exec(text)?.[1];
  const rawWho = rawWho0 && !notName.test(rawWho0.replace(/^the\s+/i, "").split(/\s+/)[0]) ? rawWho0 : undefined;
  const withWho = rawWho ? rawWho.split(/\s+/).reduce<string[]>((acc, w, i) => (acc.length === i && !(i > 0 && notName.test(w)) ? [...acc, w] : acc), []).join(" ") || undefined : undefined;
  let who: Contact | null = null;
  if (withWho && contactId === undefined) {
    const all = await ctx.store.list("contacts", ctx.userId);
    const lc = withWho.toLowerCase();
    const hits = all.filter((c) => c.name.toLowerCase() === lc || c.name.toLowerCase().startsWith(lc + " ") || lc.startsWith(c.name.toLowerCase()));
    if (hits.length === 1) who = hits[0];
  }
  const finalTitle = title ?? `${nounTitle ?? label(kind)}${withWho ? ` with ${who?.name ?? withWho}` : ""}${addr ? ` — ${addr}` : ""}`;
  const args = { title: finalTitle, kind, start_at: start.toISOString(), end_at: end.toISOString(), location: addr, contact_id: contactId ?? who?.id ?? null, property_id: propertyId ?? prop?.id ?? null };
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
  ctx.state.last_action = { type: "create", event_id: ev.id };
  await persistState(ctx);
  await logContactEvent(ctx, ev.contact_id, "calendar_added", `${ev.title} — ${fmtDayTime(ev.start_at, ctx.tz)}`);
  const ahead = await thinkAhead(ctx, ev);
  // something the agent told Mila earlier ("I never show on Sundays") still counts: say so, don't block
  const dayName = fmtDay(ev.start_at, ctx.tz).split(/[ ,]/)[0].toLowerCase();
  const rule = (await ctx.store.list("memories", ctx.userId)).find((m) => new RegExp(`\\b(never|don't|do not|no)\\b.*\\b${dayName}s?\\b`, "i").test(`${m.key} ${m.value}`) && /\b(show|open house|work|meet|book)/i.test(`${m.key} ${m.value}`));
  if (rule) ahead.note += `\n\n⚠️ Heads up: you told me “${rule.value.slice(0, 80)}”. It's booked, say the word if you want it moved.`;
  return reply(`Added: ${ev.title}, ${fmtDayTime(ev.start_at, ctx.tz)}.${ahead.note}`, [eventCard(ctx, ev, "Added"), ...ahead.blocks]);
}

/** What a sharp assistant would notice right after booking something: tight drive time, and the obvious next moves. */
export async function thinkAhead(ctx: Ctx, ev: CalendarEvent): Promise<{ note: string; blocks: Block[] }> {
  const start = new Date(ev.start_at).getTime(), end = new Date(ev.end_at).getTime();
  const others = (await upcomingEvents(ctx)).filter((e) => e.id !== ev.id);
  const before = others.filter((e) => new Date(e.end_at).getTime() <= start && start - new Date(e.end_at).getTime() < 30 * 60_000).pop();
  const after = others.find((e) => new Date(e.start_at).getTime() >= end && new Date(e.start_at).getTime() - end < 30 * 60_000);
  const tight = [before && { e: before, gap: Math.round((start - new Date(before.end_at).getTime()) / 60000) }, after && { e: after, gap: Math.round((new Date(after.start_at).getTime() - end) / 60000) }].filter(Boolean) as { e: CalendarEvent; gap: number }[];
  const differs = (e: CalendarEvent) => !!ev.location && !!e.location && ev.location.toLowerCase() !== e.location.toLowerCase();
  const t = tight.find((x) => differs(x.e)) ?? tight.find((x) => x.gap <= 10);
  const note = t ? `\n\nHeads up: that's only ${t.gap} min from ${t.e.title}${differs(t.e) ? " at a different address" : ""} — leave time to drive.` : "";
  const buttons: any[] = [];
  const when = new Date(start - 60 * 60_000);
  if (["showing", "open_house", "meeting", "closing", "call"].includes(ev.kind) && when.getTime() > ctx.now.getTime()) buttons.push({ label: "Remind me 1 hour before", style: "secondary", action: { type: "event_reminder", eventId: ev.id, minutes: 60 } });
  if (ev.kind === "showing" && ev.property_id) buttons.push({ label: "Start showing sheet", style: "secondary", href: `/properties/${ev.property_id}` });
  if (ev.kind === "closing") buttons.push({ label: "Remind me of the final walkthrough", style: "secondary", action: { type: "event_reminder", eventId: ev.id, minutes: 24 * 60, title: "Final walkthrough" } });
  return { note, blocks: buttons.length ? [{ type: "choice", title: "Want me to…", buttons }] : [] };
}

export async function eventReminder(ctx: Ctx, eventId: string, minutes: number, title?: string): Promise<HandlerOut> {
  const ev = await ctx.store.get("calendar_events", ctx.userId, eventId);
  if (!ev) return reply("I couldn't find that event anymore.", [], "smalltalk");
  const at = new Date(new Date(ev.start_at).getTime() - minutes * 60_000);
  if (at.getTime() <= ctx.now.getTime()) return reply("That reminder time has already passed.", [], "smalltalk");
  const r = (await TOOLS.create_reminder.run(ctx, { title: title ? `${title} — ${ev.title}` : `${ev.title} starts soon`, remind_at: at.toISOString(), event_id: ev.id, contact_id: ev.contact_id, internal: true })) as any;
  return reply(r.ok ? `Done — I'll remind you ${fmtDayTime(at, ctx.tz)}.` : "I couldn't set that reminder.", [], "smalltalk");
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
    return reply(out.result.ok ? "Canceled." : out.result.message);
  }
  const { event, candidates } = await resolveEvent(ctx, text);
  if (!event) return candidates.length ? reply("Which one should I cancel?", [{ type: "choice", title: "Which event?", buttons: candidates.slice(0, 5).map((e) => ({ label: `${e.title} · ${fmtDayTime(e.start_at, ctx.tz)}`, style: "secondary" as const, action: { type: "cancel_pick", eventId: e.id } })) }]) : reply("I don't see a matching event on your calendar.");
  return cancelEvent(ctx, event);
}
export async function cancelEvent(ctx: Ctx, event: CalendarEvent): Promise<HandlerOut> {
  const out = await invoke(ctx, "cancel_calendar_event", { id: event.id });
  const who = event.contact_id ? await ctx.store.get("contacts", ctx.userId, event.contact_id) : null;
  // after a cancel the next question is always "do they know?": offer the message, warm and ready
  const reschedule: Block[] = who ? [{ type: "choice", title: `Let ${firstName(who.name)} know`, buttons: [
    { label: `✉️ Email ${firstName(who.name)} to reschedule`, style: "secondary", action: { type: "prompt", text: `Email ${who.name} that I need to cancel ${event.title} on ${fmtDayTime(event.start_at, ctx.tz)} and ask what other time works for them` } },
    ...(who.phone ? [{ label: `💬 Text ${firstName(who.name)} to reschedule`, style: "secondary" as const, action: { type: "prompt" as const, text: `Text ${who.name} that I need to cancel ${event.title} on ${fmtDayTime(event.start_at, ctx.tz)} and ask what other time works for them` } }] : []),
  ] }] : [];
  if (out.status === "needs_approval") return reply(`Ready to cancel ${event.title} (${fmtDayTime(event.start_at, ctx.tz)}). Tap confirm and it's off your calendar.`, [{ type: "notice", tone: "warn", title: out.approval.title, body: out.approval.summary ?? undefined, buttons: [{ label: "Confirm cancel", style: "primary", approvalId: out.approval.id }] }, ...reschedule]);
  return reply(out.result.ok ? `Canceled ${event.title}.` : out.result.message, reschedule);
}

export type { Property, SocialPost };


/** "I'm out of town next Friday" / "off Monday through Wednesday": block the days, and warn about anything already booked. */
export async function timeOffHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const [a, b] = text.split(/\b(?:through|thru|until|till|to)\b|(?<=\d)\s*[-–—]\s*(?=\d|[a-z]{3})/i);
  const d1 = parseDate(a, ctx.now, ctx.tz);
  if (!d1) return askBack(ctx, "time_off", text, "date", "Which day or days will you be out?");
  const d2 = b ? parseDate(b, ctx.now, ctx.tz) : null;
  const first = zonedToUtc(d1.y, d1.m, d1.d, 8, 0, ctx.tz);
  const last = d2 ? zonedToUtc(d2.y, d2.m, d2.d, 18, 0, ctx.tz) : zonedToUtc(d1.y, d1.m, d1.d, 18, 0, ctx.tz);
  if (last.getTime() < first.getTime()) return reply("That end date is before the start. Which days did you mean?");
  if (last.getTime() < ctx.now.getTime()) return reply("That's already passed, so I haven't blocked anything. Which upcoming days did you mean?");
  const clash = (await upcomingEvents(ctx)).filter((e) => new Date(e.start_at) < last && new Date(e.end_at) > first && e.kind !== "other");
  const out = await invoke(ctx, "create_calendar_event", { title: "Out of office", kind: "other", start_at: first.toISOString(), end_at: last.toISOString(), ignoreConflicts: true });
  if (out.status === "needs_approval") {
    await persistState(ctx);
    return reply("This will change your calendar, so I need a yes first.", [{ type: "notice", tone: "info", title: "Block time off", body: `${fmtDay(first, ctx.tz)}${d2 ? ` – ${fmtDay(last, ctx.tz)}` : ""}`, buttons: [{ label: "Confirm", style: "primary", approvalId: out.approval.id }] }]);
  }
  if (!out.result.ok) return reply(`I couldn't block that: ${out.result.message}`);
  const when = d2 ? `${fmtDay(first, ctx.tz)} – ${fmtDay(last, ctx.tz)}` : fmtDay(first, ctx.tz);
  if (!clash.length) return reply(`Blocked ${when} as out of office. Nothing else is booked then.`, [eventCard(ctx, (out.result as any).data.event)]);
  return reply(`Blocked ${when} as out of office. Heads up — you already have ${plural(clash.length, "thing")} on those days. Want me to move them?`, [
    ...clash.slice(0, 4).map((e) => eventCard(ctx, e, "Conflicts with time off")),
    { type: "choice", title: "Fix the conflicts", buttons: [{ label: `Push all ${clash.length} to the first day back`, style: "primary" as const, action: { type: "shift_events", eventIds: clash.map((e) => e.id), after: last.toISOString() } }, ...clash.slice(0, 4).map((e) => ({ label: `Move ${e.title}`, style: "secondary" as const, action: { type: "move_pick", eventId: e.id, text: "move to", declared: false } }))] },
  ]);
}

/** Moves each booked event to the same time on the first day after time off (the day after `after`). */
export async function shiftEvents(ctx: Ctx, eventIds: string[], after: string): Promise<HandlerOut> {
  const back = addDays(new Date(after), 1, ctx.tz), b = partsIn(back, ctx.tz);
  const moved: CalendarEvent[] = [];
  for (const id of eventIds.slice(0, 20)) {
    const ev = await ctx.store.get("calendar_events", ctx.userId, id);
    if (!ev || ev.status !== "confirmed") continue;
    const sp = partsIn(new Date(ev.start_at), ctx.tz), len = new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime();
    const start = zonedToUtc(b.y, b.m, b.d, sp.h, sp.mi, ctx.tz);
    const out = await invoke(ctx, "update_calendar_event", { id: ev.id, start_at: start.toISOString(), end_at: new Date(start.getTime() + len).toISOString(), requested: true });
    if (out.status !== "needs_approval" && out.result.ok) moved.push(((out.result as any).data?.event as CalendarEvent) ?? ev);
  }
  if (!moved.length) return reply("I couldn't move those, so nothing changed.", [], "smalltalk");
  return reply(`Moved ${plural(moved.length, "thing")} to ${fmtDay(back, ctx.tz)}, your first day back. Want me to let anyone know?`, moved.slice(0, 6).map((e) => eventCard(ctx, e, "Moved")), "smalltalk");
}


// ---------------------------------------------------------------- questions about the calendar, and "undo"

const eventLine = (ctx: Ctx, e: CalendarEvent) => `${fmtTime(e.start_at, ctx.tz)} – ${fmtTime(e.end_at, ctx.tz)}  ${e.title}`;
const KIND_NOUN: [RegExp, CalendarEvent["kind"]][] = [[/open house/i, "open_house"], [/showing|tour/i, "showing"], [/lunch|dinner|coffee/i, "lunch"], [/closing/i, "closing"], [/call/i, "call"], [/meeting|appointment/i, "meeting"]];

/** "what's on my calendar Friday", "am I free Friday at 3", "when is my next showing" — answered from the real calendar, nothing is changed. */
export async function agendaHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const all = (await ctx.store.list("calendar_events", ctx.userId)).filter((e) => e.status === "confirmed").sort((a, b) => a.start_at.localeCompare(b.start_at));
  const w = parseWhen(text, ctx.now, ctx.tz);
  const kind = KIND_NOUN.find(([re]) => re.test(text))?.[1];
  const addr = parseAddress(text);

  // "when is my next showing" / "what time is my showing at 12 Oak St"
  if (kind && !w.date) {
    let list = all.filter((e) => e.kind === kind && new Date(e.end_at).getTime() > ctx.now.getTime());
    if (addr) list = list.filter((e) => `${e.title} ${e.location ?? ""}`.toLowerCase().includes(addr.toLowerCase()));
    if (!list.length) return reply(`I don't see an upcoming ${label(kind).toLowerCase()}${addr ? ` at ${addr}` : ""} on your calendar.`, [], "smalltalk");
    const shown = /\bnext\b/i.test(text) ? list.slice(0, 1) : list.slice(0, 5);
    return reply(shown.length === 1 ? `Your ${/\bnext\b/i.test(text) ? "next " : ""}${label(kind).toLowerCase()}: ${shown[0].title}, ${fmtDay(shown[0].start_at, ctx.tz)} ${fmtShortDate(shown[0].start_at, ctx.tz)}, ${fmtTime(shown[0].start_at, ctx.tz)} – ${fmtTime(shown[0].end_at, ctx.tz)}.` : `Here are your upcoming ${label(kind).toLowerCase()}s:\n${shown.map((e) => `• ${fmtDay(e.start_at, ctx.tz)} ${fmtShortDate(e.start_at, ctx.tz)}  ${eventLine(ctx, e)}`).join("\n")}`, shown.map((e) => eventCard(ctx, e)), "smalltalk");
  }

  // "am I free Friday at 3?"
  if (/\b(free|busy|available|open)\b|\bdo i have (?:anything|something)\b/i.test(text) && w.date && w.time) {
    const start = w.start!, end = w.end ?? new Date(start.getTime() + 60 * 60_000);
    const clash = all.filter((e) => new Date(e.start_at) < end && new Date(e.end_at) > start);
    if (!clash.length) return reply(`Yes, you're free ${fmtDay(start, ctx.tz)} at ${fmtTime(start, ctx.tz)}. Nothing on your calendar then.`, [], "smalltalk");
    return reply(`No, you're not free ${fmtDay(start, ctx.tz)} at ${fmtTime(start, ctx.tz)}. You have ${clash.map((e) => `${e.title} (${fmtTime(e.start_at, ctx.tz)} – ${fmtTime(e.end_at, ctx.tz)})`).join(" and ")}.`, clash.slice(0, 4).map((e) => eventCard(ctx, e)), "smalltalk");
  }

  // a day, or a stretch of days
  let from = startOfDay(ctx.now, ctx.tz), to = startOfDay(addDays(from, 1, ctx.tz), ctx.tz), name = "today";
  if (w.date) { from = zonedToUtc(w.date.y, w.date.m, w.date.d, 0, 0, ctx.tz); to = startOfDay(addDays(from, 1, ctx.tz), ctx.tz); name = ymdLabel(ctx, from); }
  else if (/\bnext week\b/i.test(text)) { const dow = partsIn(ctx.now, ctx.tz).dow; from = startOfDay(addDays(ctx.now, 7 - dow, ctx.tz), ctx.tz); to = startOfDay(addDays(from, 7, ctx.tz), ctx.tz); name = "next week"; }
  else if (/\b(this week|rest of the week|upcoming|coming up|next 7 days|this coming week)\b/i.test(text)) { to = startOfDay(addDays(from, 7, ctx.tz), ctx.tz); name = "the next 7 days"; }
  const list = all.filter((e) => new Date(e.start_at) < to && new Date(e.end_at) > from);
  if (!list.length) return reply(`Nothing on your calendar ${name === "today" || name.startsWith("next") || name.startsWith("the") ? name : `for ${name}`}. You're free.`, [], "smalltalk");
  const multi = to.getTime() - from.getTime() > 26 * 3_600_000;
  const lines = list.slice(0, 12).map((e) => `• ${multi ? `${fmtDay(e.start_at, ctx.tz)}  ` : ""}${eventLine(ctx, e)}`);
  return reply(`${name === "today" ? "Today" : name[0].toUpperCase() + name.slice(1)} you have ${plural(list.length, "thing")}:\n${lines.join("\n")}`, list.slice(0, 6).map((e) => eventCard(ctx, e)), "smalltalk");
}
const ymdLabel = (ctx: Ctx, d: Date) => {
  const diff = Math.round((startOfDay(d, ctx.tz).getTime() - startOfDay(ctx.now, ctx.tz).getTime()) / 86_400_000);
  return diff === 0 ? "today" : diff === 1 ? "tomorrow" : diff > 1 && diff < 7 ? fmtDay(d, ctx.tz) : `${fmtDay(d, ctx.tz)}, ${fmtShortDate(d, ctx.tz)}`;
};

/** A typed "undo": reverses the last move (right away) or the last thing she added (which asks first, like every cancel). */
export async function undoHandler(ctx: Ctx): Promise<HandlerOut> {
  const la = ctx.state.last_action;
  if (!la) return reply("There's nothing to undo right now.", [], "smalltalk");
  ctx.state.last_action = null;
  if (la.type === "move") {
    const ev = await ctx.store.get("calendar_events", ctx.userId, la.event_id);
    if (!ev || ev.status !== "confirmed") return reply("That event isn't on your calendar anymore, so there's nothing to put back.", [], "smalltalk");
    const out = await applyMove(ctx, ev, new Date(la.start_at), new Date(la.end_at), true, true);
    ctx.state.last_action = null;
    return reply(`Undone. ${out.text}`, out.blocks, out.creditKey);
  }
  if (la.type === "create") {
    const ev = await ctx.store.get("calendar_events", ctx.userId, la.event_id);
    if (!ev || ev.status !== "confirmed") return reply("That event is already gone.", [], "smalltalk");
    return cancelEvent(ctx, ev);
  }
  const prop = await ctx.store.get("properties", ctx.userId, la.property_id);
  if (!prop) return reply("I can't find that listing anymore.", [], "smalltalk");
  await ctx.store.update("properties", ctx.userId, prop.id, la.patch as never);
  return reply(`Undone. I put ${prop.address} back the way it was.`, [], "smalltalk");
}
