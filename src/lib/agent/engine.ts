import { randomUUID } from "node:crypto";
import { getStore } from "../db/store";
import { InsufficientCredits, creditCost, ensureCredits, getBalance, recordUsage } from "../credits";
import { aiAvailable } from "../ai/provider";
import type { Block, CalendarEvent, Conversation, DocumentRow, Message, Profile } from "../types";
import { greetingFor } from "./debrief";
import { type Ctx, firstName, plural } from "./context";
import { appendMila, persistState } from "./conversation";
import { type Intent, detectIntent } from "./intents";
import { llmChat, llmClassify } from "./llm";
import { clientUpdateHandler, learnFromTurn } from "./learn";
import { splitClauses } from "./nlu";
import { decideApproval } from "./tools";
import { applyMove, cancelEvent, cancelEventHandler, createEventHandler, findTimeForEvent, moveEventHandler, pickSlot, resolveConflict, resolveStale, timeOffHandler } from "./handlers/calendar";
import { draftEmailHandler, socialPostHandler } from "./handlers/comms";
import { emailAudienceHandler } from "./handlers/openhouse";
import { debriefHandler, deleteHandler, mentionedContacts, findContactsHandler, findPropertyForContactHandler, newContactHandler, prioritiesHandler, recallHandler, saveMemoryHandler } from "./handlers/contacts";
import { batchFollowUpHandler, handleAttachments, importResultReply, pastedListHandler } from "./handlers/followups";
import { openHouseHandler } from "./handlers/openhouse";
import { listingLinkHandler } from "./handlers/photos";
import { reminderHandler } from "./handlers/reminders";
import { type HandlerOut, reply } from "./handlers/types";
import { marketResearch } from "./research";
import { importCandidates } from "./ingest";
import { dropNegatedDate, invalidTimeToken, overrideWhen, parseDate, parseLocation, parseTime } from "./nlu";

export type Action = { type: string; [k: string]: any };

export interface TurnInput {
  conversationId?: string | null;
  message?: string;
  action?: Action;
  attachmentIds?: string[];
  onStep?: (label: string) => void;
}

export interface TurnOutput {
  conversationId: string;
  userMessage: Message | null;
  milaMessage: Message;
  balance: number;
}

export async function buildCtx(profile: Profile, conversationId?: string | null, onStep?: (l: string) => void): Promise<Ctx> {
  const store = getStore();
  let conv: Conversation | null = conversationId ? await store.get("conversations", profile.id, conversationId) : null;
  if (!conv) {
    // continue the most recent conversation: Mila's context should persist across visits
    const all = (await store.list("conversations", profile.id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    conv = all[0] ?? (await store.insert("conversations", profile.id, { title: null, state: {} }));
  }
  const steps: string[] = [];
  const push = steps.push.bind(steps);
  steps.push = (...items: string[]) => { for (const i of items) if (steps[steps.length - 1] !== i) onStep?.(i); return push(...items.filter((i) => steps[steps.length - 1] !== i)); };
  return { userId: profile.id, profile, store, now: (globalThis as { __milaNow?: Date }).__milaNow ?? new Date(), tz: profile.timezone || "America/New_York", conversationId: conv.id, state: conv.state ?? {}, steps, usage: { aiCalls: 0, creditsKey: "chat_simple", extraCredits: 0 } };
}

const isYes = (t: string) => /^(yes|yep|yeah|sure|do it|please do|update (?:it|them|everything)|go ahead|ok|okay)\b/i.test(t.trim());
const isNo = (t: string) => /^(no|nope|leave (?:it|them)|keep (?:it|them)|don'?t|not now)\b/i.test(t.trim());

export async function handleTurn(profile: Profile, input: TurnInput): Promise<TurnOutput> {
  const ctx = await buildCtx(profile, input.conversationId, input.onStep);
  const store = ctx.store;
  const text = (input.message ?? "").trim();
  const docs = (await Promise.all((input.attachmentIds ?? []).map((id) => store.get("documents", ctx.userId, id)))).filter(Boolean) as DocumentRow[];

  let userMessage: Message | null = null;
  if (text || docs.length) {
    userMessage = await store.insert("messages", ctx.userId, { conversation_id: ctx.conversationId, role: "user", content: text, blocks: [], attachments: docs.map((d) => ({ id: d.id, name: d.name, kind: d.kind })) });
    const conv = await store.get("conversations", ctx.userId, ctx.conversationId);
    if (conv && !conv.title && text) await store.update("conversations", ctx.userId, conv.id, { title: text.slice(0, 60) });
  }

  let out: HandlerOut;
  let intent: Intent = "general";
  try {
    await ensureCredits(ctx.userId, 1);
    if (input.action && !text) {
      out = await runAction(ctx, input.action);
      intent = "smalltalk";
    } else {
      const r = await runText(ctx, text, docs);
      out = r.out; intent = r.intent;
      if (text) await learnFromTurn(ctx, text);
    }
  } catch (e) {
    if (e instanceof InsufficientCredits) {
      out = reply("You've used all your Mila credits for this period.", [{ type: "notice", tone: "warn", title: "Out of credits", body: "Add more credits to keep going. Nothing you already have is lost.", buttons: [{ label: "Add credits", style: "primary", href: "/settings/credits" }] }], "smalltalk");
    } else {
      console.error("[mila] turn failed", e);
      out = reply("Something went wrong on my side, and I didn't complete that. Nothing was changed that I can't tell you about — please try again.", [{ type: "notice", tone: "error", title: "That didn't work", body: e instanceof Error ? e.message : undefined }], "smalltalk");
    }
  }

  // Charge once per turn, based on what actually happened.
  const key = out.creditKey ?? (intent === "smalltalk" ? "smalltalk" : "chat_simple");
  await recordUsage({ userId: ctx.userId, conversationId: ctx.conversationId, operation: `turn:${intent}`, creditKey: key });
  await persistState(ctx);
  const milaMessage = await appendMila(ctx, out.text, out.blocks);
  return { conversationId: ctx.conversationId, userMessage, milaMessage, balance: await getBalance(ctx.userId) };
}

async function recentHistory(ctx: Ctx) {
  const msgs = (await ctx.store.list("messages", ctx.userId)).filter((m) => m.conversation_id === ctx.conversationId).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-8);
  return msgs.map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.content })).filter((m) => m.content);
}

async function runText(ctx: Ctx, textIn: string, docs: DocumentRow[]): Promise<{ out: HandlerOut; intent: Intent }> {
  let text = textIn;
  const pend = ctx.state.pending;
  let forced: Intent | null = null; // an answer to Mila's question continues THAT request, whatever the merged text looks like

  if (pend?.kind === "stale_comms" && text) {
    if (isYes(text)) return { out: await resolveStale(ctx, pend.event_id, "update"), intent: "move_event" };
    if (isNo(text)) return { out: await resolveStale(ctx, pend.event_id, "leave"), intent: "smalltalk" };
  }
  if (pend?.kind === "clarify" && text) {
    const d = detectIntent(text);
    const words = text.split(/\s+/).length;
    // A reply continues the open question only if it looks like an answer. A different request ("remind me to call Dana") or a
    // question moves on — the old question is dropped, never allowed to swallow what the agent actually said.
    const looksLikeAnswer = d.intent === "general" || d.intent === "smalltalk" || d.intent === pend.intent || (words <= 4 && !!(parseTime(text) || parseDate(text, ctx.now, ctx.tz)));
    if (looksLikeAnswer && !/\?\s*$/.test(text)) {
      text = dropNegatedDate(text);
      const orig = overrideWhen((pend.slots as { text: string }).text, text, ctx.now, ctx.tz);
      // a bare "12" / "2:30" answering "what time?" means "at 12" / "at 2:30"
      const bareTime = pend.missing === "time" && /^\s*\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?\s*$/i.test(text);
      text = `${orig} ${bareTime ? "at " : ""}${text}`;
      forced = pend.intent as Intent;
      ctx.state.pending = null;
    } else ctx.state.pending = null;
  } else if (pend && text && pend.kind !== "stale_comms") {
    // a new request supersedes an unanswered choice
    ctx.state.pending = null;
  }

  if (docs.length) return { out: await handleAttachments(ctx, docs, text), intent: "signin_paste" };

  // "Actually make that 4" / "no, Sunday" / "sorry 4pm" right after Mila put something on the calendar means: change THAT event.
  if (!forced && !pend && ctx.state.last_event_id && text.split(/\s+/).length <= 8) {
    const m = /^(?:(?:actually|no|nope|wait|oops|sorry|hmm|ok(?:ay)?|um)[,.!\s]+)*(?:(?:can we |could we |let'?s |lets )?(?:make|do|change|move|push|switch|say)\s+(?:it|that|this)(?:\s+(?:to|at|for))?|it'?s|its|how about|what about|at|for|to)?\s*(.+?)[.!\s]*$/i.exec(text);
    const rest = m?.[1]?.trim();
    if (rest && /^(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?|noon|(?:today|tomorrow|tonight|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)[a-z]*(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)?)$/i.test(rest) && (parseTime(rest) || parseDate(rest, ctx.now, ctx.tz) || /^\d{1,2}$/.test(rest))) {
      const when = /^\d{1,2}$/.test(rest) ? `at ${rest}` : rest;
      return { out: await dispatch(ctx, "move_event", `move that to ${when}`, true), intent: "move_event" };
    }
  }

  const clauses = splitClauses(text);
  const outs: HandlerOut[] = [];
  let lastIntent: Intent = "general";
  for (const [ci, clause] of clauses.entries()) {
    let d = ci === 0 && forced ? { intent: forced, declared: false } : detectIntent(clause);
    if (d.intent === "general") d = (await llmClassify(ctx, clause)) ?? d;
    lastIntent = d.intent;
    outs.push(await dispatch(ctx, d.intent, clause, !!d.declared));
  }
  if (outs.length === 1) return { out: outs[0], intent: lastIntent };
  const costs = await Promise.all(outs.map(async (o) => ({ k: o.creditKey ?? "chat_simple", c: await creditCost(o.creditKey ?? "chat_simple") })));
  const top = costs.sort((a, b) => b.c - a.c)[0];
  return { out: { text: outs.map((o) => o.text).filter(Boolean).join("\n\n"), blocks: outs.flatMap((o) => o.blocks), creditKey: top.k }, intent: lastIntent };
}

async function dispatch(ctx: Ctx, intent: Intent, text: string, declared: boolean): Promise<HandlerOut> {
  ctx.steps.push("Understanding request");
  if (["open_house", "create_event", "move_event", "reminder", "general"].includes(intent)) {
    const bad = invalidTimeToken(text);
    if (bad) return reply(`“${bad}” isn't a real time, so I haven't changed anything. What time did you mean? (for example 2 PM or 14:00)`, [], "smalltalk");
  }
  if (["general", "recall", "find_contacts", "save_memory"].includes(intent)) {
    const known = await mentionedContacts(ctx, text);
    if (known.length) { const u = await clientUpdateHandler(ctx, text, known); if (u) return u; }
  }
  switch (intent) {
    case "time_off": return timeOffHandler(ctx, text);
    case "open_house": return openHouseHandler(ctx, text);
    case "move_event": return moveEventHandler(ctx, text, declared);
    case "cancel_event": return cancelEventHandler(ctx, text);
    case "create_event": return createEventHandler(ctx, text);
    case "reminder": return reminderHandler(ctx, text);
    case "new_contact": return newContactHandler(ctx, text);
    case "priorities": ctx.steps.push("Looking at your contacts and tasks"); return prioritiesHandler(ctx);
    case "debrief": return debriefHandler(ctx);
    case "find_contacts": return findContactsHandler(ctx, text);
    case "recall": return recallHandler(ctx, text);
    case "delete_data": return deleteHandler(ctx, text);
    case "listing_link": return listingLinkHandler(ctx, text);
    case "save_memory": return saveMemoryHandler(ctx, text);
    case "find_property": return findPropertyForContactHandler(ctx, text);
    case "signin_paste": return pastedListHandler(ctx, text);
    case "batch_followups": return batchFollowUpHandler(ctx, text);
    case "social_post": return socialPostHandler(ctx, text);
    case "draft_email": return draftEmailHandler(ctx, text);
    case "email_audience": return emailAudienceHandler(ctx, text);
    case "market": return marketHandler(ctx, text);
    case "smalltalk": return smalltalk(ctx, text);
    default: return generalHandler(ctx, text);
  }
}

function smalltalk(ctx: Ctx, text: string): HandlerOut {
  if (/thank|thx/i.test(text)) return reply("Anytime.", [], "smalltalk");
  if (/^(ok|okay|cool|great|got it)/i.test(text)) return reply("👍", [], "smalltalk");
  return reply(`${greetingFor(ctx.now, ctx.tz, ctx.profile.full_name)} What do you need to get done?`, [], "smalltalk");
}

async function marketHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const loc = parseLocation(text) ?? (/\b(my market|here|my area)\b/i.test(text) ? ctx.profile.primary_market : "") ?? "";
  const location = loc || ctx.profile.primary_market || ctx.profile.location;
  if (!location) return reply("Which market should I look at?");
  ctx.steps.push("Searching current market data");
  const r = await marketResearch(ctx, location, text);
  if ("error" in r) return reply("I can't give you live market numbers right now.", [{ type: "notice", tone: "warn", title: "Live data isn't available", body: r.error, buttons: r.connect ? [{ label: "See connections", style: "secondary", href: "/settings/connections" }] : undefined }], "smalltalk");
  return reply(r.cached ? "Here's the latest I pulled (cached for a few hours)." : "Here's what I found.", [r.block], r.cached ? "chat_simple" : "smalltalk");
}

async function generalHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  // Questions that mention someone in the user's own data are answered from that data first.
  const known = await mentionedContacts(ctx, text);
  if (known.length && !aiAvailable()) return recallHandler(ctx, text);
  let extra = "";
  if (known.length) {
    const { contactFacts } = await import("./memory");
    extra = (await Promise.all(known.slice(0, 3).map(async (c) => `${c.name} (${c.type}, ${c.status}${c.location ? ", " + c.location : ""}): ${(await contactFacts(ctx, c)).join("; ") || "no saved details"}`))).join("\n");
  }
  const ai = await llmChat(ctx, text, await recentHistory(ctx), extra);
  if (ai) return reply(ai, [], /\b(plan|strategy|analy|compare|negotiat)/i.test(text) ? "chat_complex" : "chat_simple");
  return reply("I'm not sure how to do that yet. Here are things I can do right now:", [{
    type: "choice", title: "Try one of these",
    buttons: [
      { label: "Set up an open house", style: "secondary", action: { type: "prompt", text: "I have an open house at 123 Main Street Sunday at 1 PM. Set everything up." } },
      { label: "Who should I follow up with?", style: "secondary", action: { type: "prompt", text: "Who do I need to follow up with today?" } },
      { label: "Add a new buyer", style: "secondary", action: { type: "prompt", text: "I have a new buyer named Sarah looking for a 3 bedroom house around $650k in Montgomery County in the next 3 months." } },
    ],
  }], "smalltalk");
}

// ------------------------------------------------------------------ actions

async function runAction(ctx: Ctx, a: Action): Promise<HandlerOut> {
  switch (a.type) {
    case "noop": return reply("Okay.", [], "smalltalk");
    case "prompt": { const r = await runText(ctx, String(a.text ?? ""), []); return r.out; }
    case "approve":
    case "reject": {
      const r = await decideApproval(ctx, a.id, a.type);
      const blocks: Block[] = [...(r.followUp ?? [])];
      if (r.approval.status === "approved" && r.approval.blocked_integration) {
        blocks.unshift({ type: "notice", tone: "warn", title: r.message, buttons: [{ label: r.approval.blocked_integration === "google" ? "Connect Google" : "See connections", style: "primary", href: "/settings/connections" }] });
        return reply("Approved — but I couldn't finish it yet.", blocks, "smalltalk");
      }
      if (r.approval.status === "failed") return reply(`That didn't go through: ${r.message}`, [{ type: "notice", tone: "error", title: "Not completed", body: r.message }], "smalltalk");
      return reply(r.message, blocks, "smalltalk");
    }
    case "approve_run": {
      const pending = (await ctx.store.list("approvals", ctx.userId)).filter((x) => x.workflow_run_id === a.runId && x.status === "pending");
      if (!pending.length) return reply("Everything in that plan is already handled.", [], "smalltalk");
      const done: string[] = [], blocked: string[] = [], failed: string[] = [];
      const follow: Block[] = [];
      for (const ap of pending) {
        const r = await decideApproval(ctx, ap.id, "approve");
        if (r.approval.status === "executed") { done.push(ap.title); follow.push(...(r.followUp ?? [])); }
        else if (r.approval.status === "approved") blocked.push(`${ap.title} — ${r.message}`);
        else failed.push(`${ap.title} — ${r.message}`);
      }
      const run = await ctx.store.get("workflow_runs", ctx.userId, a.runId);
      if (run) await ctx.store.update("workflow_runs", ctx.userId, run.id, { status: failed.length || blocked.length ? "waiting_approval" : "completed" });
      const blocks: Block[] = [...follow];
      if (blocked.length) blocks.push({ type: "notice", tone: "warn", title: `${plural(blocked.length, "item is", "items are")} approved but waiting on a connection`, body: blocked.join("\n"), buttons: [{ label: "Connect", style: "primary", href: "/settings/connections" }] });
      if (failed.length) blocks.push({ type: "notice", tone: "error", title: `${plural(failed.length, "item")} didn't complete`, body: failed.join("\n") });
      return reply(done.length ? `Done: ${done.join(", ")}.` : "I approved them, but nothing could be completed yet.", blocks, "smalltalk");
    }
    case "conflict": return resolveConflict(ctx, a.choice);
    case "pick_slot": return pickSlot(ctx, a.start, a.end);
    case "move_pick": {
      const ev = await ctx.store.get("calendar_events", ctx.userId, a.eventId);
      if (!ev) return reply("I couldn't find that event.", [], "smalltalk");
      ctx.state.last_event_id = ev.id;
      return moveEventHandler(ctx, `${a.text} ${ev.kind.replace("_", " ")}`.trim(), !!a.declared);
    }
    case "move_apply": {
      const ev = await ctx.store.get("calendar_events", ctx.userId, a.eventId);
      if (!ev) return reply("I couldn't find that event.", [], "smalltalk");
      return applyMove(ctx, ev, new Date(a.start), new Date(a.end), !!a.declared, !!a.ignoreConflicts);
    }
    case "find_time": return findTimeForEvent(ctx, a.eventId, a.durationMin ?? 60);
    case "cancel_pick": { const ev = await ctx.store.get("calendar_events", ctx.userId, a.eventId); return ev ? cancelEvent(ctx, ev) : reply("I couldn't find that event.", [], "smalltalk"); }
    case "stale_comms": return resolveStale(ctx, a.eventId, a.choice);
    case "import_confirm": {
      const res = await importCandidates(ctx, [a.candidate], { source: a.source ?? "Upload", tag: a.tag, propertyAddress: a.address, forceAdd: true });
      return importResultReply(ctx, res, { source: a.source, tag: a.tag, address: a.address });
    }
    case "import_merge": {
      const c = a.candidate;
      const cur = await ctx.store.get("contacts", ctx.userId, a.contactId);
      if (!cur) return reply("I couldn't find that contact.", [], "smalltalk");
      await ctx.store.update("contacts", ctx.userId, cur.id, { email: cur.email ?? c.email ?? null, phone: cur.phone ?? c.phone ?? null, notes: [cur.notes, c.notes].filter(Boolean).join("\n") || null, tags: [...new Set([...cur.tags, ...(a.tag ? [a.tag] : [])])] });
      ctx.state.last_import_batch = [...new Set([...(ctx.state.last_import_batch ?? []), cur.id])];
      return reply(`Merged into ${cur.name}.`, [], "smalltalk");
    }
    case "tag_contact": {
      const r = (await (await import("./tools")).TOOLS.update_contact.run(ctx, { id: a.contactId, patch: { tags: [String(a.tag)] }, eventTitle: `Also a ${a.tag}`, eventKind: "note" })) as any;
      return reply(r.ok ? `Done — added "${a.tag}" to ${r.data.contact.name}'s profile.` : "I couldn't find that contact.", [], "smalltalk");
    }
    case "quick_task": {
      const r = (await (await import("./tools")).TOOLS.create_task.run(ctx, { kind: "follow_up", title: a.title, subtitle: a.subtitle, contact_id: a.contactId, due_at: new Date(ctx.now.getTime() + 24 * 3_600_000).toISOString() })) as any;
      return reply(r.ok ? "Added to your tasks." : r.message, [], "smalltalk");
    }
    default: return reply("I'm not sure what that button does yet.", [], "smalltalk");
  }
}

export type { CalendarEvent };
export { firstName, aiAvailable, randomUUID };
