import { addDays, fmtDayTime, partsIn, zonedToUtc } from "../../time";
import type { Ctx } from "../context";
import { stripPunct, stripWhenWords, parseWhen, rollPastWeekday } from "../nlu";
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
  const split = /\b(?:to|about|that)\b\s*/i.exec(body);
  const head = split ? body.slice(0, split.index) : body;
  const tail = split ? body.slice(split.index + split[0].length) : "";
  let title = stripPunct(stripWhenWords(tail || (split ? "" : "")));
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
  if (!when) return askBack(ctx, "reminder", text, "time", `When should I remind you?${recurring ? " (I can only set one-time reminders for now, not repeating ones.)" : ""}`);
  if (when) when = rollPastWeekday(when, text, ctx.now, ctx.tz);
  if (when.getTime() <= ctx.now.getTime()) return askBack(ctx, "reminder", text, "time", "That time has already passed — what other time should I use?");
  // "remind me to call him": him/her is the one person we were just talking about, so the reminder says who
  if (/\b(?:him|her)\b/i.test(title) && ctx.state.last_contact_ids?.length === 1) {
    const c = await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]);
    if (c) title = title.replace(/\b(?:him|her)\b/i, firstNameOf(c.name));
  }
  if (!title) title = "Reminder";
  title = title.charAt(0).toUpperCase() + title.slice(1);
  const out = await invoke(ctx, "create_reminder", { title, remind_at: when.toISOString(), event_id: eventId });
  if (out.status === "needs_approval") return reply("Ready to set that reminder.", [{ type: "notice", tone: "info", title: out.approval.title, body: out.approval.summary ?? undefined, buttons: [{ label: "Set reminder", style: "primary", approvalId: out.approval.id }] }]);
  if (!out.result.ok) return reply(out.result.message);
  return reply(`I'll remind you ${fmtDayTime(when, ctx.tz).replace(" • ", " at ")}: ${title}.${recurring ? " Heads up: I can only set one-time reminders for now, so this won't repeat. Tell me again after it goes off and I'll set the next one." : ""}`);
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
