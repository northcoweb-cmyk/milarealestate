/**
 * Small questions about the agent's own data, answered straight from what is saved: how many contacts, the next open house,
 * today's to-dos, a percentage of a number, and a recap of this chat. Free, instant, nothing invented.
 */
import { type Ctx, fullMoney } from "../context";
import { fmtDayTime, fmtTime, startOfDay } from "../../time";
import { parseMoney } from "../nlu";
import { type HandlerOut, reply } from "./types";

export type BasicsKind = "count_contacts" | "count_properties" | "next_open_house" | "next_showing" | "showings_range" | "focus_today" | "stale_contacts" | "status_of" | "tasks_today" | "percent_of" | "chat_recap";

export function basicsKind(text: string): BasicsKind | null {
  const t = text.toLowerCase().trim();
  if (/^\s*(?:what(?:'s| is)|how much is|calculate|whats)\s+\d+(?:\.\d+)?\s?%\s+of\s+\$?\d/.test(t)) return "percent_of";
  if (/\bhow many (?:contacts|clients|buyers|sellers|leads|people)\b.{0,25}\b(?:do i have|are there|have i got|in my)\b|\bhow many (?:contacts|clients|buyers|sellers|leads) do i\b/.test(t)) return "count_contacts";
  if (/\bhow many (?:(?:active|live|current|upcoming|sold|pending)\s+)?(?:properties|listings|homes|houses)\b/.test(t)) return "count_properties";
  if (/\b(?:what(?:'s| is)|when(?:'s| is)|show me) (?:my )?next open house\b/.test(t)) return "next_open_house";
  if (/\b(?:any|which|what|how many|show me|list)\b.{0,25}\bshowings?\b.{0,25}\b(?:next week|this week|tomorrow|today)\b|\bshowings?\b.{0,12}\b(?:next week|this week)\b/.test(t)) return "showings_range";
  if (/\bwhat should i (?:focus on|work on|tackle|do|prioriti[sz]e)\b.{0,20}\btoday\b|\bwhat(?:'s| is) my (?:focus|top priorit\w+)\b.{0,15}\btoday\b|\bwhat do i need to (?:focus on|get done|handle) today\b|\bwhat(?:'s| is) (?:most )?(?:urgent|important) today\b/.test(t)) return "focus_today";
  if (/\bwho (?:haven'?t|have not|hasn'?t) i (?:talked|spoken|reached|been in touch|contacted|heard)\b|\bwho (?:have i )?(?:not|n'?t) (?:talked|spoken|contacted)\b|\bhaven'?t (?:talked|spoken|contacted|reached out)\b.{0,30}\b(?:in a while|lately|recently|in weeks)\b|\blong time since\b.{0,20}\b(?:talked|spoke|contact)/.test(t)) return "stale_contacts";
  if (/\b(?:what(?:'s| is)|whats) the status of\b|\bis\b.{3,40}\bstill (?:available|on the market|active|for sale)\b/.test(t)) return "status_of";
  if (/\b(?:what(?:'s| is)|when(?:'s| is)) (?:my )?next showing\b/.test(t)) return "next_showing";
  if (/\bwhat (?:are|is) (?:on )?my (?:tasks?|to-?dos?|to do list)(?: (?:for )?today)?\b|\bwhat do i have to do today\b|\bmy tasks (?:for )?today\b/.test(t)) return "tasks_today";
  if (/\bwhat did (?:we|i) (?:talk|chat|discuss|say)\b.{0,30}\b(?:chat|conversation|so far|today)\b|\brecap (?:this|our) (?:chat|conversation)\b/.test(t)) return "chat_recap";
  return null;
}

export async function basicsHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const kind = basicsKind(text);
  switch (kind) {
    case "percent_of": {
      const m = /(\d+(?:\.\d+)?)\s?%\s+of\s+(\$?\s?\d[\d,.]*\s?(?:k|m)?)/i.exec(text)!;
      const base = parseMoney(m[2].startsWith("$") ? m[2] : `$${m[2]}`).max ?? parseFloat(m[2].replace(/,/g, ""));
      const pct = parseFloat(m[1]);
      return reply(`${m[1]}% of ${fullMoney(base)} is ${fullMoney(Math.round(base * pct) / 100)}.`, [], "chat_simple");
    }
    case "count_contacts": {
      const all = await ctx.store.list("contacts", ctx.userId);
      const by: Record<string, number> = {}; for (const c of all) by[c.type] = (by[c.type] ?? 0) + 1;
      const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k === "rental" ? "renter" : k.replace("_", " ")}${n === 1 ? "" : "s"}`);
      return reply(all.length ? `You have ${all.length} contact${all.length === 1 ? "" : "s"}: ${parts.join(", ")}.` : "You don't have any contacts saved yet.", [], "chat_simple");
    }
    case "count_properties": {
      const all = await ctx.store.list("properties", ctx.userId);
      const want = /\b(active|live|current)\b/i.test(text) ? "active" : /\bupcoming\b/i.test(text) ? "upcoming" : /\bsold\b/i.test(text) ? "sold" : /\b(?:pending|under contract)\b/i.test(text) ? "under_contract" : null;
      if (want) {
        const { buildCard } = await import("../../property-stage");
        const mems = await ctx.store.list("memories", ctx.userId), evs = await ctx.store.list("calendar_events", ctx.userId);
        const hit = all.filter((p) => buildCard(p, mems, evs, [], ctx.now).stage === want);
        const word = want === "under_contract" ? "under contract" : want === "active" ? "live on the market" : want;
        return reply(`${hit.length} of your ${all.length} propert${all.length === 1 ? "y is" : "ies are"} ${word}${hit.length ? `: ${hit.slice(0, 6).map((p) => p.address).join(", ")}` : ""}.`, [], "chat_simple");
      }
      return reply(`You have ${all.length} propert${all.length === 1 ? "y" : "ies"} saved.`, [], "chat_simple");
    }
    case "next_open_house":
    case "next_showing": {
      const evs = (await ctx.store.list("calendar_events", ctx.userId)).filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > ctx.now.getTime() && (kind === "next_open_house" ? e.kind === "open_house" : e.kind === "showing")).sort((a, b) => a.start_at.localeCompare(b.start_at));
      const e = evs[0];
      return reply(e ? `Your next ${kind === "next_open_house" ? "open house" : "showing"}: ${e.title.split(" — ").pop()}, ${fmtDayTime(e.start_at, ctx.tz)}${new Date(e.end_at).getTime() - new Date(e.start_at).getTime() > 0 ? ` to ${new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, hour: "numeric", minute: "2-digit" }).format(new Date(e.end_at))}` : ""}.` : `You don't have a ${kind === "next_open_house" ? "open house" : "showing"} on the calendar yet.`, [], "chat_simple");
    }
    case "showings_range": {
      const t = text.toLowerCase();
      const dow = Number(new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, weekday: "narrow" }).format(ctx.now) && ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, weekday: "short" }).format(ctx.now)]);
      const day0 = startOfDay(ctx.now, ctx.tz).getTime();
      let from = day0, to = day0 + 86_400_000, label = "today";
      if (/tomorrow/.test(t)) { from = day0 + 86_400_000; to = from + 86_400_000; label = "tomorrow"; }
      else if (/next week/.test(t)) { from = day0 + (((8 - dow) % 7) || 7) * 86_400_000; to = from + 7 * 86_400_000; label = "next week"; }
      else if (/this week/.test(t)) { to = day0 + (((8 - dow) % 7) || 7) * 86_400_000; label = "this week"; }
      const evs = (await ctx.store.list("calendar_events", ctx.userId)).filter((e) => e.status === "confirmed" && e.kind === "showing" && new Date(e.start_at).getTime() >= from && new Date(e.start_at).getTime() < to).sort((a, b) => a.start_at.localeCompare(b.start_at));
      return reply(evs.length ? `${evs.length === 1 ? "One showing" : `${evs.length} showings`} ${label}:\n${evs.map((e) => `• ${fmtDayTime(e.start_at, ctx.tz)}: ${e.title.split(" — ").pop()}`).join("\n")}` : `You don't have any showings ${label}.`, [], "chat_simple");
    }
    case "focus_today": {
      const { computePriorities } = await import("../prioritize");
      const day0 = startOfDay(ctx.now, ctx.tz), day1 = new Date(day0.getTime() + 86_400_000);
      const evs = (await ctx.store.list("calendar_events", ctx.userId)).filter((e) => e.status === "confirmed" && new Date(e.start_at) >= day0 && new Date(e.start_at) < day1).sort((a, b) => a.start_at.localeCompare(b.start_at));
      const tasks = (await ctx.store.list("tasks", ctx.userId)).filter((t) => t.status === "open" && t.kind !== "approval" && t.due_at && new Date(t.due_at) < day1).sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""));
      const approvals = (await ctx.store.list("approvals", ctx.userId)).filter((a) => a.status === "pending");
      const follow = (await computePriorities(ctx)).filter((x) => x.source === "contact").slice(0, 3);
      const parts: string[] = [];
      if (evs.length) parts.push(`On the calendar today:\n${evs.slice(0, 8).map((e) => `• ${fmtTime(e.start_at, ctx.tz)}  ${e.title}${e.notes === "Transaction milestone" ? " (deadline)" : ""}`).join("\n")}`);
      if (approvals.length) parts.push(`Waiting for your OK (${approvals.length}):\n${approvals.slice(0, 4).map((a) => `• ${a.title}`).join("\n")}`);
      if (tasks.length) parts.push(`Due or overdue:\n${tasks.slice(0, 5).map((t) => `• ${t.title}${new Date(t.due_at!) < day0 ? " (overdue)" : ""}`).join("\n")}${tasks.length > 5 ? `\n• …and ${tasks.length - 5} more` : ""}`);
      if (follow.length) parts.push(`People to reach out to:\n${follow.map((f) => `• ${f.title}: ${f.reason || "follow up"}`).join("\n")}`);
      return reply(parts.length ? `Here's your focus for today, in the order I'd do it:\n\n${parts.join("\n\n")}` : "Nothing is booked or due today, and nobody needs a follow-up right now. A good day to prospect or post.", [], "chat_simple");
    }
    case "stale_contacts": {
      const all = (await ctx.store.list("contacts", ctx.userId)).filter((c) => c.status !== "inactive" && c.status !== "closed");
      const days = (c: { last_contact_at: string | null }) => (c.last_contact_at ? Math.floor((ctx.now.getTime() - new Date(c.last_contact_at).getTime()) / 86_400_000) : null);
      const ranked = all.map((c) => ({ c, d: days(c) })).sort((a, b) => (b.d ?? 9999) - (a.d ?? 9999)).slice(0, 8);
      if (!ranked.length) return reply("You don't have any contacts saved yet.", [], "chat_simple");
      return reply(`The people you've gone longest without talking to:\n${ranked.map(({ c, d }) => `• ${c.name}: ${d === null ? "no contact logged yet" : d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} ago`}`).join("\n")}\nWant me to draft a check-in for any of them?`, [], "chat_simple");
    }
    case "status_of": {
      const { resolveProperty } = await import("./listing");
      const { buildCard } = await import("../../property-stage");
      const p = await resolveProperty(ctx, text, true).catch(() => null);
      if (!p) return reply("Which home? Give me the address and I'll tell you where it stands.", [], "chat_simple");
      const mems = await ctx.store.list("memories", ctx.userId), evs = await ctx.store.list("calendar_events", ctx.userId);
      const card = buildCard(p, mems, evs, [], ctx.now);
      const closing = evs.filter((e) => e.status === "confirmed" && /closing/i.test(e.title) && e.title.toLowerCase().includes(p.address.toLowerCase())).sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
      return reply(`${p.address} is ${card.stage_label.toLowerCase()}${p.list_price ? ` (listed at ${fullMoney(p.list_price)})` : ""}${closing ? `, closing ${fmtDayTime(closing.start_at, ctx.tz)}` : ""}.${card.stage === "under_contract" ? " An offer has been accepted, so it isn't available." : ""}`, [], "chat_simple");
    }
    case "tasks_today": {
      const end = new Date(startOfDay(ctx.now, ctx.tz).getTime() + 86_400_000);
      const open = (await ctx.store.list("tasks", ctx.userId)).filter((t) => t.status === "open" && t.kind !== "approval" && (!t.due_at || new Date(t.due_at) < end)).sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9")).slice(0, 8);
      return reply(open.length ? `Your to-dos for today${open.some((t) => t.due_at && new Date(t.due_at) < startOfDay(ctx.now, ctx.tz)) ? " (some are overdue)" : ""}:\n${open.map((t) => `• ${t.title}${t.due_at ? ` · ${fmtDayTime(t.due_at, ctx.tz)}` : ""}`).join("\n")}` : "You have no open to-dos due today.", [{ type: "choice", title: "More", buttons: [{ label: "Open Tasks", style: "quiet", href: "/tasks" }] }], "chat_simple");
    }
    case "chat_recap": {
      const msgs = (await ctx.store.list("messages", ctx.userId)).filter((m) => m.conversation_id === ctx.conversationId && m.role === "user").sort((a, b) => a.created_at.localeCompare(b.created_at));
      const prior = msgs.slice(0, -1).slice(-8);
      return reply(prior.length ? `In this chat you asked me:\n${prior.map((m) => `• ${m.content.replace(/\s+/g, " ").slice(0, 110)}`).join("\n")}` : "We haven't said anything else in this chat yet.", [], "chat_simple");
    }
    default:
      return reply("What would you like to know?", [], "smalltalk");
  }
}
