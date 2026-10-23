/**
 * Small questions about the agent's own data, answered straight from what is saved: how many contacts, the next open house,
 * today's to-dos, a percentage of a number, and a recap of this chat. Free, instant, nothing invented.
 */
import { type Ctx, fullMoney } from "../context";
import { fmtDayTime, startOfDay } from "../../time";
import { parseMoney } from "../nlu";
import { type HandlerOut, reply } from "./types";

export type BasicsKind = "count_contacts" | "count_properties" | "next_open_house" | "next_showing" | "tasks_today" | "percent_of" | "chat_recap";

export function basicsKind(text: string): BasicsKind | null {
  const t = text.toLowerCase().trim();
  if (/^\s*(?:what(?:'s| is)|how much is|calculate|whats)\s+\d+(?:\.\d+)?\s?%\s+of\s+\$?\d/.test(t)) return "percent_of";
  if (/\bhow many (?:contacts|clients|buyers|sellers|leads|people)\b.{0,25}\b(?:do i have|are there|have i got|in my)\b|\bhow many (?:contacts|clients|buyers|sellers|leads) do i\b/.test(t)) return "count_contacts";
  if (/\bhow many (?:properties|listings|homes|houses)\b/.test(t)) return "count_properties";
  if (/\b(?:what(?:'s| is)|when(?:'s| is)|show me) (?:my )?next open house\b/.test(t)) return "next_open_house";
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
      return reply(`You have ${all.length} propert${all.length === 1 ? "y" : "ies"} saved.`, [], "chat_simple");
    }
    case "next_open_house":
    case "next_showing": {
      const evs = (await ctx.store.list("calendar_events", ctx.userId)).filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > ctx.now.getTime() && (kind === "next_open_house" ? e.kind === "open_house" : e.kind === "showing")).sort((a, b) => a.start_at.localeCompare(b.start_at));
      const e = evs[0];
      return reply(e ? `Your next ${kind === "next_open_house" ? "open house" : "showing"}: ${e.title.split(" — ").pop()}, ${fmtDayTime(e.start_at, ctx.tz)}${new Date(e.end_at).getTime() - new Date(e.start_at).getTime() > 0 ? ` to ${new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, hour: "numeric", minute: "2-digit" }).format(new Date(e.end_at))}` : ""}.` : `You don't have a ${kind === "next_open_house" ? "open house" : "showing"} on the calendar yet.`, [], "chat_simple");
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
