import { addDays, fmtDayTime, partsIn, zonedToUtc } from "../../time";
import type { Ctx } from "../context";
import { stripPunct, parseWhen } from "../nlu";
import { invoke } from "../tools";
import { resolveEvent } from "./calendar";
import { type HandlerOut, reply } from "./types";
import { askBack } from "./ask";

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, a: 1 };

export async function reminderHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const titleMatch = /\bremind me\b.*?\b(?:to|about|that)\s+(.+)$/i.exec(text);
  let title = titleMatch ? stripPunct(titleMatch[1]) : "";
  // strip trailing temporal phrases from the title
  let when: Date | null = null;
  let eventId: string | null = null;

  const before = /\b(\d+|one|two|three|four|five|a)\s+(day|hour|week)s?\s+before\b/i.exec(text);
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
    const head = text.replace(/\bremind me\b/i, "").split(/\b(?:to|about|that)\b/i)[0];
    const w = parseWhen(head, ctx.now, ctx.tz);
    if (w.date && !w.time) when = zonedToUtc(w.date.y, w.date.m, w.date.d, 9, 0, ctx.tz);
    else if (w.start) when = w.start;
    else if (w.time) {
      const p = partsIn(ctx.now, ctx.tz);
      when = zonedToUtc(p.y, p.m, p.d, w.time.start.h, w.time.start.mi, ctx.tz);
      if (when.getTime() <= ctx.now.getTime()) when = new Date(when.getTime() + 86_400_000);
    }
  }
  if (!when) return askBack(ctx, "reminder", text, "time", "When should I remind you?");
  if (when.getTime() <= ctx.now.getTime()) return askBack(ctx, "reminder", text, "time", "That time has already passed — what other time should I use?");
  if (!title) title = "Reminder";
  title = title.charAt(0).toUpperCase() + title.slice(1);
  const out = await invoke(ctx, "create_reminder", { title, remind_at: when.toISOString(), event_id: eventId });
  if (out.status === "needs_approval") return reply("Ready to set that reminder.", [{ type: "notice", tone: "info", title: out.approval.title, body: out.approval.summary ?? undefined, buttons: [{ label: "Set reminder", style: "primary", approvalId: out.approval.id }] }]);
  if (!out.result.ok) return reply(out.result.message);
  return reply(`I'll remind you ${fmtDayTime(when, ctx.tz).replace(" • ", " at ")}: ${title}.`);
}
