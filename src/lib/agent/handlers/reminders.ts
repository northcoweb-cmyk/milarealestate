import { addDays, fmtDayTime, partsIn, zonedToUtc } from "../../time";
import type { Ctx } from "../context";
import { parseTime, stripPunct, stripWhenWords, parseWhen, rollPastWeekday } from "../nlu";
import { invoke } from "../tools";
import { resolveEvent } from "./calendar";
import { type HandlerOut, reply } from "./types";
import { askBack } from "./ask";
import { firstNameOf } from "../../names";

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, an: 1 };

/** "in 2 hours", "in an hour", "in 45 min", "in half an hour" */
function relativeAhead(text: string): number | null {
  const m = /\bin\s+(\d+(?:\.\d+)?|an?|one|two|three|four|five|half an?)\s*(hours?|hrs?|minutes?|mins?)\b/i.exec(text);
  if (!m) return null;
  const n = m[1].toLowerCase().startsWith("half") ? 0.5 : (WORDS[m[1].toLowerCase()] ?? parseFloat(m[1]));
  return /^h/i.test(m[2]) ? n * 60 : n;
}

export async function reminderHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  // everything after "remind me" / "set a reminder": a head (when) and a tail (what), in either order
  const body = text.replace(/^.*?\b(?:remind me|set (?:a )?reminder)\b/i, "");
  let split = /\b(?:to|about|that)\b\s*/i.exec(body);
  // "remind me tomorrow at 2 call Victor about the listing": no "to", but a verb starts what it is about (the weak "about" never cuts the sentence in half)
  { const verb = /\b(?:call|text|email|send|follow up|check|ask|meet|review|prepare|order|renew|pick up|drop off|schedule|book|confirm)\b/i.exec(body);
    if (verb && (!split || (/^(?:about|that)\b/i.test(split[0]) && verb.index < split.index))) split = Object.assign([verb[0].match(/^/)?.[0] ?? ""], { index: verb.index, input: body }) as unknown as RegExpExecArray; }
  // "set a reminder for the roof repair response deadline, Monday at 5": the words right after "for" are what it is about
  const forTail = !split ? /^\s*for\s+(.+)$/i.exec(body)?.[1] : null;
  const head = split ? body.slice(0, split.index) : body;
  const tail = split ? body.slice(split.index + split[0].length) : forTail ?? "";
  let title = stripPunct(stripWhenWords(tail || (split ? "" : ""))).replace(/\b(?:in the |this )?(?:morning|afternoon|evening|tonight)\b/ig, "").replace(/[,\s]*\b(?:due|by|on|for|at)\b[,\s]*$/i, "").replace(/\s{2,}/g, " ").replace(/[,\s]+$/, "").trim();
  let when: Date | null = null;
  let eventId: string | null = null;

  const before = /\b(\d+|one|two|three|four|five|a|an)\s+(day|hour|week)s?\s+before\b/i.exec(text);
  const after = /\bafter\s+(?:the|my)\s+(showing|open house|call|meeting|appointment|closing)\b/i.exec(text);
  if (before || after) {
    const { event } = await resolveEvent(ctx, text);
    const ev = event ?? (ctx.state.last_event_id ? await ctx.store.get("calendar_events", ctx.userId, ctx.state.last_event_id) : null);
    if (!ev) return reply("Which event should I remind you about?");
    eventId = ev.id;
    if (before) {
      const n = WORDS[before[1].toLowerCase()] ?? +before[1];
      const unit = before[2].toLowerCase();
      if (unit === "hour") when = new Date(new Date(ev.start_at).getTime() - n * 3_600_000);
      else { const p = partsIn(addDays(new Date(ev.start_at), -n * (unit === "week" ? 7 : 1), ctx.tz), ctx.tz); when = zonedToUtc(p.y, p.m, p.d, 9, 0, ctx.tz); }
    } else when = new Date(new Date(ev.end_at).getTime() + 30 * 60_000);
    title ||= `${ev.title}`;
  } else {
    const ahead = relativeAhead(head) ?? relativeAhead(tail);
    if (ahead != null) when = new Date(ctx.now.getTime() + ahead * 60_000);
    else {
      for (const part of [head, tail]) {
        if (when) break;
        const w = parseWhen(part, ctx.now, ctx.tz);
        if (w.date && !w.time) when = zonedToUtc(w.date.y, w.date.m, w.date.d, 9, 0, ctx.tz);
        else if (w.start) when = w.start;
        else if (w.time) {
          const p = partsIn(ctx.now, ctx.tz);
          when = zonedToUtc(p.y, p.m, p.d, w.time.start.h, w.time.start.mi, ctx.tz);
          if (when.getTime() <= ctx.now.getTime()) when = new Date(when.getTime() + 86_400_000);
        }
      }
    }
  }
  const recurring = /\b(every|each|daily|weekly|monthly|annually|yearly|recurring|repeat(?:ing)?)\b/i.test(text);
  if (!when && recurring) { // "every Monday at 8am": the first one is the next Monday at 8
    const t2 = text.replace(/\bevery\s+(?:day|weekday|week|morning|evening)\b/gi, "").replace(/\b(?:every|each|weekly|daily|weekdays)\b/gi, "");
    const w = parseWhen(t2, ctx.now, ctx.tz);
    if (w.start) when = w.start;
    else if (w.time) { const p = partsIn(ctx.now, ctx.tz); when = zonedToUtc(p.y, p.m, p.d, w.time.start.h, w.time.start.mi, ctx.tz); if (when.getTime() <= ctx.now.getTime()) when = new Date(when.getTime() + 86_400_000); }
  }
  if (when && recurring && /\bweekdays?\b/i.test(text)) { // the first one lands on a working day
    for (let i = 0; i < 2; i++) { const d = new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, weekday: "short" }).format(when); if (d === "Sat" || d === "Sun") when = addDays(when, 1, ctx.tz); }
  }
  if (!when) return askBack(ctx, "reminder", text, "time", `When should I remind you?${recurring ? " (I can only set one-time reminders for now, not repeating ones.)" : ""}`);
  if (when) when = rollPastWeekday(when, text, ctx.now, ctx.tz);
  if (when.getTime() <= ctx.now.getTime()) return askBack(ctx, "reminder", text, "time", "That time has already passed — what other time should I use?");
  // "remind me to call him": him/her is the one person we were just talking about, so the reminder says who
  if (/\b(?:him|her)\b/i.test(title) && ctx.state.last_contact_ids?.length === 1) {
    const c = await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]);
    if (c) title = title.replace(/\b(?:him|her)\b/i, firstNameOf(c.name));
  }
  // "check on it": what "it" is comes from the chat (the contact or home just discussed), so the reminder still makes sense next week
  if (/^(?:check|follow up|look|circle back|ask|call|text|email)\b[^.]{0,20}\b(?:it|that|this|them)\b$/i.test(title)) {
    const c = ctx.state.last_contact_ids?.length === 1 ? await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]) : null;
    const pr = ctx.state.last_property_id ? await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id) : null;
    const subj = [c?.name, pr?.address].filter(Boolean).join(", ");
    if (subj) title = `${title.replace(/\b(?:it|that|this|them)\b/i, "").replace(/\s+/g, " ").trim()} — ${subj}`;
  }
  if (!title) title = "Reminder";
  title = title.charAt(0).toUpperCase() + title.slice(1);
  const out = await invoke(ctx, "create_reminder", { title, remind_at: when.toISOString(), event_id: eventId });
  if (out.status === "needs_approval") return reply("Ready to set that reminder.", [{ type: "notice", tone: "info", title: out.approval.title, body: out.approval.summary ?? undefined, buttons: [{ label: "Set reminder", style: "primary", approvalId: out.approval.id }] }]);
  if (!out.result.ok) return reply(out.result.message);
  // "every Monday at 8am": the next occurrences are set as ordinary reminders (about 3 months of them), so the schedule keeps going without a repeat engine
  const every = recurring ? (/\b(?:every\s+month|monthly)\b/i.test(text) ? { step: 0, count: 6, skipWeekend: false, label: "every month for the next six months" } : /\b(?:every\s+(?:day|morning|evening)|daily)\b/i.test(text) ? { step: 1, count: 14, skipWeekend: false, label: "every day for the next two weeks" } : /\bevery\s+weekday\b|\bweekdays\b/i.test(text) ? { step: 1, count: 20, skipWeekend: true, label: "every weekday for the next four weeks" } : /\b(?:every\s+(?:week|(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?)|weekly|each\s+(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?)\b/i.test(text) ? { step: 7, count: 12, skipWeekend: false, label: "every week for the next 12 weeks" } : null) : null;
  let moreSet = 0;
  if (every) {
    let cursor = when;
    for (let i = 1; i < every.count; i++) {
      if (every.step === 0) { const p0 = partsIn(when, ctx.tz); const mm = p0.m - 1 + i; cursor = zonedToUtc(p0.y + Math.floor(mm / 12), (mm % 12) + 1, p0.d, p0.h, p0.mi, ctx.tz); }
      else cursor = addDays(cursor, every.step, ctx.tz);
      const dow = Number(new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, weekday: "narrow" }).format(cursor) && ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, weekday: "short" }).format(cursor)]);
      if (every.skipWeekend && (dow === 0 || dow === 6)) continue;
      const more = await invoke(ctx, "create_reminder", { title, remind_at: cursor.toISOString(), event_id: null });
      if (more.status !== "needs_approval" && more.result.ok) moreSet++;
    }
  }
  const far = when.getTime() - ctx.now.getTime() > 5 * 86_400_000 || (/\bnext\s+(?:mon|tues?|wed|thu|fri|sat|sun)/i.test(text) && !/^(?:today|tomorrow)/i.test(fmtDayTime(when, ctx.tz))); // a weekday a week or more away carries its date, so "Thursday" can't mean today's Thursday
  const whenLabel = far ? fmtDayTime(when, ctx.tz).replace(" • ", `, ${new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, month: "short", day: "numeric" }).format(when)} at `) : fmtDayTime(when, ctx.tz).replace(" • ", " at ");
  return reply(`I'll remind you ${whenLabel}: ${title}.${every ? ` I set it ${every.label} (${moreSet + 1} reminders). They are all in your reminders list if you want to remove any.` : recurring ? " Heads up: I can only set one-time reminders for now, so this won't repeat. Tell me again after it goes off and I'll set the next one." : ""}`);
}

/** "Cancel the reminder to call Dana": find it by its words and day, show exactly which one, and only remove it after a tap. */
export async function cancelReminderHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const all = (await ctx.store.list("reminders", ctx.userId)).filter((r) => r.status === "pending").sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  if (!all.length) return reply("You don't have any reminders set, so there's nothing to cancel.", [], "smalltalk");
  const stop = new Set(["cancel", "delete", "remove", "clear", "the", "my", "a", "reminder", "reminders", "to", "for", "about", "on", "at", "please", "get", "rid", "of", "forget", "that", "this", "me"]);
  const words = text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !stop.has(w));
  const day = parseWhen(text, ctx.now, ctx.tz).date;
  let hits = all;
  if (day) hits = hits.filter((r) => { const p = partsIn(new Date(r.remind_at), ctx.tz); return p.y === day.y && p.m === day.m && p.d === day.d; });
  const named = words.filter((w) => !/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|next|week|morning|afternoon)$/.test(w));
  if (named.length) hits = hits.filter((r) => named.some((w) => r.title.toLowerCase().includes(w)));
  if (!hits.length) return reply("I don't see a matching reminder, so I haven't removed anything.", [], "smalltalk");
  const btn = (r: (typeof all)[number]) => ({ label: `${r.title} · ${fmtDayTime(r.remind_at, ctx.tz)}`, style: "secondary" as const, action: { type: "cancel_reminder", id: r.id } });
  if (hits.length > 1) return reply("Which reminder?", [{ type: "choice", title: "Which reminder should I remove?", buttons: hits.slice(0, 5).map(btn) }], "smalltalk");
  const r = hits[0];
  return reply(`Remove the reminder “${r.title}” (${fmtDayTime(r.remind_at, ctx.tz)})?`, [{ type: "choice", title: "Remove this reminder?", buttons: [{ label: "Yes, remove it", style: "primary", action: { type: "cancel_reminder", id: r.id } }, { label: "Keep it", style: "quiet", action: { type: "noop" } }] }], "smalltalk");
}

export async function cancelReminderAction(ctx: Ctx, id: string): Promise<HandlerOut> {
  const r = await ctx.store.get("reminders", ctx.userId, id);
  if (!r || r.status === "cancelled") return reply("That reminder is already gone.", [], "smalltalk");
  await ctx.store.update("reminders", ctx.userId, id, { status: "cancelled" } as never);
  const back = await ctx.store.get("reminders", ctx.userId, id);
  return reply(back?.status === "cancelled" ? `Removed the reminder “${r.title}”.` : "I couldn't remove that reminder.", [], "smalltalk");
}

/** "Add a task for Priya: send comps": a to-do with the agent's own words, tied to the person if one is named, with a day only if they gave one. */
export async function addTaskHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const { mentionedContacts } = await import("./contacts");
  const people = await mentionedContacts(ctx, text);
  if (people.length > 1 && !people.every((p) => firstNameOf(p.name) !== firstNameOf(people[0].name))) {
    return reply(`Which ${firstNameOf(people[0].name)}?`, [{ type: "choice", title: `Which ${firstNameOf(people[0].name)}?`, buttons: people.slice(0, 5).map((c) => ({ label: c.name, style: "secondary" as const, action: { type: "prompt", text: text.replace(new RegExp(`\\b${firstNameOf(c.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), c.name) } })) }], "smalltalk");
  }
  const who = people.length === 1 ? people[0] : null;
  let body = text.replace(/^\s*(?:(?:please|pls|ok|okay|hey|can you|could you)[,\s]+)*(?:add|create|make|put|new|set up)\s+(?:a |an |me a |another )?(?:new )?(?:task|to-?do|todo)\s*(?:to do |to |for |:)?\s*/i, "");
  // "for Priya: send comps" → the words after the colon are the task
  const colon = /^(?:for |with |about )?[^:]{1,60}:\s*(.+)$/.exec(body);
  if (colon) body = colon[1];
  const w = parseWhen(text, ctx.now, ctx.tz);
  body = stripWhenWords(body).replace(/\s+/g, " ").replace(/[,\s]*\b(?:due|by|on|for|at)\b[,\s]*$/i, "").replace(/(?:,\s*)?\bdue\s*,\s*due\b/ig, "").replace(/[.,;:\s]+$/, "").trim();
  if (!body) return askBack(ctx, "add_task", text, "details", "What's the task?");
  const title = (body.charAt(0).toUpperCase() + body.slice(1)) + (who && !new RegExp(`\\b${firstNameOf(who.name)}\\b`, "i").test(body) ? ` (${firstNameOf(who.name)})` : "");
  const due = w.date ? zonedToUtc(w.date.y, w.date.m, w.date.d, w.time?.start.h ?? 9, w.time?.start.mi ?? 0, ctx.tz).toISOString() : null;
  const { TOOLS } = await import("../tools");
  const out = (await TOOLS.create_task.run(ctx, { kind: "task", title: title.slice(0, 200), contact_id: who?.id ?? null, due_at: due, internal: true })) as any;
  const saved = out?.ok ? await ctx.store.get("tasks", ctx.userId, out.data.task.id) : null;
  if (!saved) return reply("I couldn't save that task, so nothing was added.", [], "smalltalk");
  return reply(`Added to your to-dos: ${saved.title}${due ? `, due ${fmtDayTime(due, ctx.tz)}` : ""}.`, [{ type: "choice", title: "Task added", buttons: [{ label: "See tasks", style: "secondary", href: "/tasks" }] }], "chat_simple");
}


/** "What are my 9am reminders tomorrow?" / "show my reminders": the pending reminders, for that day or the coming week. */
export async function listRemindersHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const all = (await ctx.store.list("reminders", ctx.userId)).filter((r) => r.status === "pending").sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  const day = parseWhen(text, ctx.now, ctx.tz).date;
  const tm = parseTime(text);
  let hits = all.filter((r) => new Date(r.remind_at).getTime() > ctx.now.getTime() - 3_600_000);
  if (day) hits = hits.filter((r) => { const p = partsIn(new Date(r.remind_at), ctx.tz); return p.y === day.y && p.m === day.m && p.d === day.d; });
  else hits = hits.filter((r) => new Date(r.remind_at).getTime() < ctx.now.getTime() + 7 * 86_400_000);
  if (tm?.explicit) hits = hits.filter((r) => { const p = partsIn(new Date(r.remind_at), ctx.tz); return p.h === tm.start.h && p.mi === tm.start.mi; });
  if (!hits.length) return reply(day ? "You don't have any reminders set for then." : "You don't have any reminders in the next 7 days.", [], "chat_simple");
  const lines = hits.slice(0, 15).map((r) => `• ${fmtDayTime(r.remind_at, ctx.tz)}: ${r.title}`);
  return reply(`${hits.length === 1 ? "1 reminder" : `${hits.length} reminders`}:\n${lines.join("\n")}`, hits.length <= 4 ? [{ type: "choice", title: "Mark one done?", buttons: hits.map((r) => ({ label: `Done: ${r.title.slice(0, 40)}`, style: "secondary" as const, action: { type: "reminder_done", id: r.id } })) }] : [], "chat_simple");
}

/** "mark the 9am one tomorrow as done": the reminder that matches is closed, and Mila says which. */
export async function reminderDoneHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const all = (await ctx.store.list("reminders", ctx.userId)).filter((r) => r.status === "pending").sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  const day = parseWhen(text, ctx.now, ctx.tz).date, tm = parseTime(text);
  let hits = all;
  if (day) hits = hits.filter((r) => { const p = partsIn(new Date(r.remind_at), ctx.tz); return p.y === day.y && p.m === day.m && p.d === day.d; });
  if (tm?.explicit) hits = hits.filter((r) => { const p = partsIn(new Date(r.remind_at), ctx.tz); return p.h === tm.start.h && p.mi === tm.start.mi; });
  const words = text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !/^(?:mark|done|complete|completed|finished|reminder|reminders|tomorrow|today|morning|that|this|them|with|from|please)$/.test(w));
  if (words.length) { const byWord = hits.filter((r) => words.some((w) => r.title.toLowerCase().includes(w))); if (byWord.length) hits = byWord; }
  if (!hits.length) return reply("I don't see a matching reminder, so nothing was changed.", [], "smalltalk");
  if (hits.length > 1) return reply("Which reminder?", [{ type: "choice", title: "Which one is done?", buttons: hits.slice(0, 5).map((r) => ({ label: `${r.title.slice(0, 40)} · ${fmtDayTime(r.remind_at, ctx.tz)}`, style: "secondary" as const, action: { type: "reminder_done", id: r.id } })) }], "smalltalk");
  return reminderDoneAction(ctx, hits[0].id);
}
export async function reminderDoneAction(ctx: Ctx, id: string): Promise<HandlerOut> {
  const r = await ctx.store.get("reminders", ctx.userId, id);
  if (!r || r.status === "cancelled") return reply("That reminder is already gone.", [], "smalltalk");
  await ctx.store.update("reminders", ctx.userId, id, { status: "done" } as never);
  const back = await ctx.store.get("reminders", ctx.userId, id);
  return reply(back?.status === "done" ? `Marked done: “${r.title}”.` : "I couldn't update that reminder.", [], "smalltalk");
}
