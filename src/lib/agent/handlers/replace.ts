import type { CalendarEvent, CalendarEventKind } from "../../types";
import { fmtDay, fmtDayTime, fmtRange, partsIn, zonedToUtc } from "../../time";
import type { Ctx } from "../context";
import { persistState } from "../conversation";
import { parseAddress, parseWhen } from "../nlu";
import { eventConflicts, freeSlots, invoke } from "../tools";
import { resolveAddress } from "../property-lookup";
import { eventCard, resolveEvent } from "./calendar";
import { type HandlerOut, reply } from "./types";

/** "Cancel the Oak open house and replace it with Pine Saturday 2-4" / "swap it for…" / "…, do a showing at Pine instead". Returns the two halves, or null. */
export function splitReplace(text: string): { left: string; right: string } | null {
  const t = text.replace(/\s+/g, " ").trim();
  const marker = /(?:,|;|\band\b|\bthen\b)?\s*\b(?:replace(?:\s+(?:it|that|this|them))?\s+(?:with|by)|swap(?:\s+(?:it|that|this))?\s+(?:out\s+)?(?:for|with)|switch(?:\s+(?:it|that|this))?\s+(?:to|for|with)|change(?:\s+(?:it|that))?\s+(?:to|into)|in (?:its|their) place(?:\s+(?:put|do|add|have|schedule|make))?|put)\b\s*/i;
  let m = marker.exec(t);
  if (m && /\b(cancel|scrap|drop|scratch|remove|swap|switch|replace)\b/i.test(t.slice(0, m.index + m[0].length))) {
    const left = t.slice(0, m.index).trim(), right = t.slice(m.index + m[0].length).trim();
    if (left && right) return { left, right: right.replace(/\s+instead\.?$/i, "") };
  }
  // "cancel the Oak open house, do an open house at 200 Pine Saturday 2-4 instead"
  m = /^(.*?\b(?:cancel|scrap|scratch|drop)\b.*?)(?:,|;|\s+and\s+|\s+then\s+)\s*(?:(?:i(?:'ll| will)\s+)?(?:do|have|make|set up|schedule|book|add|put)\b)\s*(.+?)(?:\s+instead)?\.?$/i.exec(t);
  if (m && /\binstead\b|\b(?:open house|showing|appointment|meeting|call|lunch|closing|inspection)\b/i.test(m[2])) return { left: m[1], right: m[2] };
  m = /^(?:actually,?\s*)?(.+?)\s+instead\s+of\s+(.+)$/i.exec(t); // "do Pine instead of Oak"
  if (m) return { left: m[2], right: m[1] };
  return null;
}

const KINDS: [RegExp, CalendarEventKind][] = [[/open house/i, "open_house"], [/showing|tour/i, "showing"], [/inspection/i, "meeting"], [/lunch|dinner|coffee/i, "lunch"], [/closing/i, "closing"], [/\bcall\b/i, "call"], [/meeting|appointment|consult/i, "meeting"]];
const kindOf = (t: string): CalendarEventKind | null => KINDS.find(([re]) => re.test(t))?.[1] ?? null;
const LABEL: Record<string, string> = { open_house: "Open House", showing: "Showing", call: "Call", lunch: "Lunch", closing: "Closing", meeting: "Meeting", other: "Event" };

/** Which event is "the original"? Exactly one match or a question. Never "whatever came up last". */
async function strictOriginal(ctx: Ctx, left: string): Promise<{ event?: CalendarEvent; candidates: CalendarEvent[] }> {
  const cleaned = left.replace(/^(?:please\s+|actually,?\s*)?(?:cancel|scrap|scratch|drop|remove|delete|swap|switch|replace)\s+(?:out\s+)?(?:my\s+|the\s+|that\s+)?/i, "");
  const { candidates } = await resolveEvent(ctx, cleaned);
  const live = candidates.filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > ctx.now.getTime());
  if (live.length === 1) return { event: live[0], candidates: live };
  return { candidates: live };
}

/** Build the exact replacement from what the agent said, filling anything unsaid from the original (same day, same time, same place, same kind). Nothing is saved yet. */
export async function buildReplacement(ctx: Ctx, orig: CalendarEvent, rightText: string) {
  const kind = kindOf(rightText) ?? orig.kind;
  const addr = parseAddress(rightText);
  const w = parseWhen(rightText, ctx.now, ctx.tz);
  const o = partsIn(new Date(orig.start_at), ctx.tz);
  const day = w.date ?? { y: o.y, m: o.m, d: o.d };
  const clock = w.time?.start ?? { h: o.h, mi: o.mi };
  const start = zonedToUtc(day.y, day.m, day.d, clock.h, clock.mi, ctx.tz);
  const origLen = new Date(orig.end_at).getTime() - new Date(orig.start_at).getTime();
  const sameShape = !w.time && kind === orig.kind;
  const end = w.time?.end ? zonedToUtc(day.y, day.m, day.d, w.time.end.h, w.time.end.mi, ctx.tz) : new Date(start.getTime() + (sameShape ? origLen : (kind === "open_house" ? 120 : kind === "showing" ? 45 : 60) * 60_000));
  let property_id = addr ? null : orig.property_id, location = addr ?? orig.location, newProperty: Record<string, unknown> | null = null;
  if (addr) {
    const props = await ctx.store.list("properties", ctx.userId);
    const hit = props.find((p) => p.address.toLowerCase() === addr.toLowerCase());
    if (hit) { property_id = hit.id; location = hit.address; }
    else {
      const r = await resolveAddress(ctx, rightText, addr, { answering: false }).catch(() => null);
      const place = r && r.status === "ok" ? r.place : null;
      newProperty = { address: addr, city: place?.city ?? null, state: place?.state ?? null, zip: place?.zip ?? null }; // saved only if the agent confirms
    }
  }
  const title = `${LABEL[kind] ?? "Event"}${location ? ` — ${location}` : ""}`;
  return { title, kind, start_at: start.toISOString(), end_at: end.toISOString(), location, property_id, contact_id: addr ? null : orig.contact_id, newProperty };
}

async function previewReplacement(ctx: Ctx, orig: CalendarEvent, repl: Awaited<ReturnType<typeof buildReplacement>>, allowOverlap = false): Promise<HandlerOut> {
  if (new Date(repl.end_at).getTime() <= ctx.now.getTime()) return reply(`That replacement time (${fmtDayTime(repl.start_at, ctx.tz)}) has already passed, so I haven't changed anything. Which day or time did you mean?`, [], "smalltalk");
  const clash = allowOverlap ? [] : await eventConflicts(ctx, repl.start_at, repl.end_at, orig.id);
  const args = { originalId: orig.id, originalVersion: orig.updated_at, replacement: repl, allowOverlap };
  if (clash.length) {
    ctx.state.pending = { kind: "replace_draft", args, clash_titles: clash.map((c) => c.title) };
    await persistState(ctx);
    return reply(`The new time (${fmtDayTime(repl.start_at, ctx.tz)}) overlaps ${clash[0].title}${clash.length > 1 ? ` and ${clash.length - 1} more` : ""}. I haven't changed anything, and I won't touch ${clash.length > 1 ? "those" : "it"}.`, [
      ...clash.slice(0, 3).map((e) => eventCard(ctx, e, "Overlaps the new time")),
      { type: "choice", title: "What would you like to do?", buttons: [
        { label: "Find another time", style: "primary", action: { type: "replace_slot_options" } },
        { label: `Replace anyway (keep ${clash[0].title.split(" — ")[0]})`, style: "secondary", action: { type: "replace_overlap" } },
        { label: "Never mind", style: "quiet", action: { type: "replace_cancel" } },
      ] },
    ], "smalltalk");
  }
  // a newer version of the same swap supersedes the older preview: the old approval must never be confirmable later
  for (const old of (await ctx.store.list("approvals", ctx.userId)).filter((x) => x.status === "pending" && x.payload.tool === "replace_calendar_event" && (x.payload.args as { originalId?: string }).originalId === orig.id)) {
    await ctx.store.update("approvals", ctx.userId, old.id, { status: "rejected", decided_at: new Date().toISOString(), error: "Superseded by a newer version" } as never);
    const t = (await ctx.store.list("tasks", ctx.userId)).find((x) => x.approval_id === old.id);
    if (t) await ctx.store.update("tasks", ctx.userId, t.id, { status: "dismissed", completed_at: new Date().toISOString() } as never);
  }
  const out = await invoke(ctx, "replace_calendar_event", args);
  if (out.status !== "needs_approval") return reply(out.result.ok ? "Replaced." : out.result.message, [], "smalltalk");
  ctx.state.pending = { kind: "approval", approval_id: out.approval.id, label: out.approval.title };
  await persistState(ctx);
  const same = (a: string, b: string) => fmtDay(a, ctx.tz) === fmtDay(b, ctx.tz);
  return reply(`Here's the swap. Nothing changes until you confirm.`, [{
    type: "notice", tone: "warn", title: out.approval.title,
    body: `Cancel: ${orig.title} (${fmtDayTime(orig.start_at, ctx.tz)}–${fmtRange(orig.start_at, orig.end_at, ctx.tz).split("–")[1] ?? ""})\nAdd: ${repl.title} (${same(orig.start_at, repl.start_at) ? "" : `${fmtDay(repl.start_at, ctx.tz)} `}${fmtRange(repl.start_at, repl.end_at, ctx.tz)})${repl.newProperty ? `\nI'll also save ${repl.newProperty.address} to Properties.` : ""}`,
    buttons: [{ label: "Confirm replacement", style: "primary", approvalId: out.approval.id }, { label: "Never mind", style: "quiet", action: { type: "replace_cancel" } }],
  }], "smalltalk");
}

export async function replaceEventHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const parts = splitReplace(text);
  if (!parts) return reply("Which event should I replace, and with what? For example “cancel the Oak open house and replace it with an open house at 200 Pine Saturday 2 to 4”.", [], "smalltalk");
  const { event: orig, candidates } = await strictOriginal(ctx, parts.left);
  if (!orig) {
    if (candidates.length > 1) {
      ctx.state.pending = { kind: "replace_pick", replacement: parts.right, candidate_ids: candidates.slice(0, 6).map((c) => c.id) };
      await persistState(ctx);
      return reply("Which one should I replace?", [{ type: "choice", title: "Which event?", buttons: candidates.slice(0, 6).map((e) => ({ label: `${e.title} · ${fmtDayTime(e.start_at, ctx.tz)}`, style: "secondary" as const, action: { type: "replace_pick", eventId: e.id } })) }], "smalltalk");
    }
    return reply("I don't see that event on your calendar, so I haven't changed anything. Which one did you mean?", [], "smalltalk");
  }
  ctx.state.last_event_id = orig.id;
  return previewReplacement(ctx, orig, await buildReplacement(ctx, orig, parts.right));
}

export async function replacePick(ctx: Ctx, eventId: string): Promise<HandlerOut> {
  const p = ctx.state.pending?.kind === "replace_pick" ? ctx.state.pending : null;
  if (!p || !p.candidate_ids.includes(eventId)) return reply("That choice is no longer open. Tell me again what to replace.", [], "smalltalk");
  const orig = await ctx.store.get("calendar_events", ctx.userId, eventId);
  ctx.state.pending = null;
  if (!orig || orig.status !== "confirmed") return reply("That event isn't on your calendar anymore, so I haven't changed anything.", [], "smalltalk");
  return previewReplacement(ctx, orig, await buildReplacement(ctx, orig, p.replacement));
}

/** "Replace anyway": the agent chose to keep the other appointment and still swap. Only this stored draft can be confirmed. */
export async function replaceOverlap(ctx: Ctx): Promise<HandlerOut> {
  const p = ctx.state.pending?.kind === "replace_draft" ? ctx.state.pending : null;
  if (!p) return reply("That choice is no longer open. Tell me again what to replace.", [], "smalltalk");
  const a = p.args as { originalId: string; replacement: Awaited<ReturnType<typeof buildReplacement>> };
  const orig = await ctx.store.get("calendar_events", ctx.userId, a.originalId);
  ctx.state.pending = null;
  if (!orig || orig.status !== "confirmed") return reply("That event isn't on your calendar anymore, so I haven't changed anything.", [], "smalltalk");
  return previewReplacement(ctx, orig, a.replacement, true);
}

export async function replaceSlotOptions(ctx: Ctx): Promise<HandlerOut> {
  const p = ctx.state.pending?.kind === "replace_draft" ? ctx.state.pending : null;
  if (!p) return reply("That choice is no longer open. Tell me again what to replace.", [], "smalltalk");
  const a = p.args as { originalId: string; replacement: Awaited<ReturnType<typeof buildReplacement>> };
  const len = (new Date(a.replacement.end_at).getTime() - new Date(a.replacement.start_at).getTime()) / 60_000;
  const slots = await freeSlots(ctx, new Date(Math.max(ctx.now.getTime(), new Date(a.replacement.start_at).getTime() - 86_400_000)), len, 3, a.originalId);
  if (!slots.length) return reply("I couldn't find an open time in the next two weeks. Your original event is unchanged.", [], "smalltalk");
  return reply("Here are open times. Pick one and I'll show you the swap before anything changes.", [{ type: "choice", title: "Pick a time", buttons: slots.map((s) => ({ label: fmtDayTime(s.start, ctx.tz), style: "secondary" as const, action: { type: "replace_slot", start: s.start.toISOString(), end: s.end.toISOString() } })) }], "smalltalk");
}

export async function replaceSlot(ctx: Ctx, start: string, end: string): Promise<HandlerOut> {
  const p = ctx.state.pending?.kind === "replace_draft" ? ctx.state.pending : null;
  if (!p) return reply("That choice is no longer open. Tell me again what to replace.", [], "smalltalk");
  const a = p.args as { originalId: string; replacement: Awaited<ReturnType<typeof buildReplacement>> };
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return reply("That time isn't valid, so I haven't changed anything.", [], "smalltalk");
  const orig = await ctx.store.get("calendar_events", ctx.userId, a.originalId);
  ctx.state.pending = null;
  if (!orig || orig.status !== "confirmed") return reply("That event isn't on your calendar anymore, so I haven't changed anything.", [], "smalltalk");
  return previewReplacement(ctx, orig, { ...a.replacement, start_at: s.toISOString(), end_at: e.toISOString() });
}

export async function replaceCancel(ctx: Ctx): Promise<HandlerOut> {
  if (ctx.state.pending?.kind === "approval" || ctx.state.pending?.kind === "replace_draft" || ctx.state.pending?.kind === "replace_pick") {
    if (ctx.state.pending.kind === "approval") {
      const a = await ctx.store.get("approvals", ctx.userId, ctx.state.pending.approval_id);
      if (a?.status === "pending") await ctx.store.update("approvals", ctx.userId, a.id, { status: "rejected", decided_at: new Date().toISOString() } as never);
    }
    ctx.state.pending = null; await persistState(ctx);
  }
  return reply("Okay. I left everything as it was.", [], "smalltalk");
}


/** "Actually Sunday 1 to 3" right after the swap preview: change THAT swap (new preview, old approval void), never start an unrelated event. */
export async function correctReplacement(ctx: Ctx, text: string): Promise<HandlerOut | null> {
  const pend = ctx.state.pending;
  if (pend?.kind !== "approval") return null;
  const ap = await ctx.store.get("approvals", ctx.userId, pend.approval_id);
  if (!ap || ap.status !== "pending" || ap.payload.tool !== "replace_calendar_event") return null;
  if (text.split(/\s+/).length > 16 || splitReplace(text) || /\b(remind|also|email|text|draft|post)\b/i.test(text)) return null;
  if (!/^(?:actually|no|nope|wait|sorry|make it|change it|let'?s|how about|instead|but)\b/i.test(text.trim())) return null;
  const args = ap.payload.args as { originalId: string; replacement: Awaited<ReturnType<typeof buildReplacement>>; allowOverlap?: boolean };
  const w = parseWhen(text, ctx.now, ctx.tz);
  if (!w.date && !w.time && !parseAddress(text)) return null;
  const orig = await ctx.store.get("calendar_events", ctx.userId, args.originalId);
  if (!orig || orig.status !== "confirmed") return null;
  const cur = args.replacement;
  const pseudo = { ...orig, title: cur.title, kind: cur.kind, start_at: cur.start_at, end_at: cur.end_at, location: cur.location, property_id: cur.property_id, contact_id: cur.contact_id } as CalendarEvent;
  const repl = await buildReplacement(ctx, pseudo, text.replace(/^(?:actually|no|nope|wait|sorry|make it|change it|let'?s|how about|instead|but)[,.\s]+/i, ""));
  return previewReplacement(ctx, orig, { ...repl, newProperty: repl.newProperty ?? cur.newProperty }, !!args.allowOverlap);
}
