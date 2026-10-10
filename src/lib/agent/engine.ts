import { randomUUID } from "node:crypto";
import { getStore } from "../db/store";
import { InsufficientCredits, TrialEnded, creditCost, ensureCredits, getBalance, recordUsage } from "../credits";
import { aiAvailable } from "../ai/provider";
import type { ActionButton, Block, CalendarEvent, Conversation, DocumentRow, Message, Profile } from "../types";
import { greetingFor } from "./debrief";
import { type Ctx, firstName, plural } from "./context";
import { appendMila, persistState } from "./conversation";
import { type Intent, detectIntent, fixTypos } from "./intents";
import { llmChat, llmClassify } from "./llm";
import { clientUpdateHandler, learnFromTurn } from "./learn";
import { logError } from "../server/errors";
import { aiLimitedReason, runInAiScope } from "../ai/budget";
import { listingReadyHandler, whatMissingHandler } from "./handlers/readiness";
import { meetingPrepHandler, showingFollowupsHandler } from "./handlers/briefs";
import { newListingsHandler, prepPropertyHandler, saveListingCard, saveRentalCard, saveRentalsForClient } from "./handlers/marketdata";
import { closedDealHandler, draftTextHandler, logInteractionHandler, pipelineHandler, transactionHandler, weekOverviewHandler } from "./handlers/deals";
import { addListingHandler, listingChecklist, showingSheetHandler, updateListingHandler } from "./handlers/listing";
import { splitClauses } from "./nlu";
import { decideApproval } from "./tools";
import { petCheckHandler, setPets } from "./handlers/pets";
import { listingAgreementHandler, saveWorksheet, worksheetForm } from "./handlers/worksheet";
import { saveAnswers } from "./handlers/contacts";
import { agendaHandler, applyMove, undoHandler, cancelEvent, cancelEventHandler, createEventHandler, findTimeForEvent, moveEventHandler, pickSlot, resolveConflict, resolveStale, timeOffHandler, shiftEvents, eventReminder, eventCard } from "./handlers/calendar";
import { fmtDayTime } from "../time";
import { draftEmailHandler, socialPostHandler } from "./handlers/comms";
import { emailAudienceHandler } from "./handlers/openhouse";
import { debriefHandler, deleteHandler, mentionedContacts, findContactsHandler, findPropertyForContactHandler, newContactHandler, prioritiesHandler, recallHandler, saveMemoryHandler } from "./handlers/contacts";
import { batchFollowUpHandler, handleAttachments, importResultReply, pastedListHandler } from "./handlers/followups";
import { openHouseHandler } from "./handlers/openhouse";
import { listingLinkHandler } from "./handlers/photos";
import { reminderHandler } from "./handlers/reminders";
import { type HandlerOut, reply } from "./handlers/types";
import { marketResearch } from "./research";
import { clientSearchHandler } from "./handlers/search";
import { importCandidates } from "./ingest";
import { plausibleName, dropNegatedDate, invalidTimeToken, overrideWhen, parseAddress, parseDate, parseLocation, parseTime } from "./nlu";

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

export function handleTurn(profile: Profile, input: TurnInput): Promise<TurnOutput> {
  return runInAiScope(profile.id, () => handleTurnInner(profile, input)); // AI spend during this turn is metered to this person
}

async function handleTurnInner(profile: Profile, input: TurnInput): Promise<TurnOutput> {
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
    if (e instanceof TrialEnded) {
      out = reply("Your 7-day trial has ended. Pick a plan to keep going — everything you built is saved and waiting.", [{ type: "notice", tone: "info", title: "Trial ended", body: "Your listings, contacts, tasks and drafts are all still here. A plan turns Mila back on.", buttons: [{ label: "Choose a plan", style: "primary", href: "/settings/credits" }] }], "smalltalk");
    } else if (e instanceof InsufficientCredits) {
      out = reply("You've used all your Mila credits for this period.", [{ type: "notice", tone: "warn", title: "Out of credits", body: "Add more credits to keep going. Nothing you already have is lost.", buttons: [{ label: "Add credits", style: "primary", href: "/settings/credits" }] }], "smalltalk");
    } else {
      console.error("[mila] turn failed", e);
      await logError({ source: "agent", message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack ?? null : null, route: `chat: ${text.slice(0, 120)}`, userId: profile.id, email: profile.email });
      out = reply("Something went wrong on my side, and I didn't complete that. Nothing was changed that I can't tell you about — please try again.", [{ type: "notice", tone: "error", title: "That didn't work" }], "smalltalk");
    }
  }

  // If the AI allowance stopped a smarter answer, say so once, plainly. Everything rule-based still ran.
  const limited = aiLimitedReason();
  if (limited && limited !== "too_big") out = { ...out, blocks: [...out.blocks, { type: "notice", tone: "info", title: limited === "disabled" || limited === "global_day" ? "Smart answers are paused for a moment" : "You've used this period's smart-answer allowance", body: limited === "disabled" || limited === "global_day" ? "Calendar, contacts, tasks and drafts still work. Try the open-ended questions again a little later." : (limited === "trial_pool" ? "Calendar, contacts, tasks, listings and drafts all still work. Start a plan to keep the open-ended answers going." : "Calendar, contacts, tasks, listings and drafts all still work. Open-ended questions come back at your next renewal, or sooner on a bigger plan."), buttons: limited === "disabled" || limited === "global_day" ? undefined : [{ label: "See plans", style: "secondary", href: "/settings/credits" }] }] };

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
  let text = fixTypos(textIn);
  // "Good morning. What do I have today?" is the question, not small talk
  const greet = /^\s*(?:good (?:morning|afternoon|evening)|morning|hey( there)?|hi( there)?|hello)\b[,.!:\s-]+(\S.{5,})$/is.exec(text);
  if (greet && !ctx.state.pending) text = greet[3].charAt(0).toUpperCase() + greet[3].slice(1);
  // "Prep me for that showing" / "what are the taxes on it": say which home, from the one we were just talking about
  if (!ctx.state.pending && !parseAddress(text) && /\b(?:prep(?:are)? me|prep|brief me|research|look ?up|pull up|taxes|tax history|last sale|sale history|comps?|assessed|home value|what'?s it worth)\b/i.test(text) && /\b(?:it|that (?:showing|house|home|property|listing|one|place)|this (?:showing|house|home|property|listing|one|place))\b/i.test(text)) {
    const lastProp = ctx.state.last_property_id ? await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id) : null;
    if (lastProp) text = `${text.replace(/[.?!]+\s*$/, "")} ${lastProp.address}${lastProp.city ? `, ${lastProp.city}` : ""}${lastProp.state ? ` ${lastProp.state}` : ""}`;
  }
  // "Give me a script for…" / "What do I say?": a script is words to say, never a message to send. Ask what kind first (phone, meeting, text, email), then answer.
  const sa = ctx.state.script_ask;
  if (sa && Date.now() - sa.at < 15 * 60_000 && text.split(/\s+/).length <= 14) {
    const mm = /\b(phone|call|voicemail|meeting|in[- ]person|face[- ]to[- ]face|text|sms|email)\b/i.exec(text);
    if (mm) { ctx.state.script_ask = null; await persistState(ctx); return { out: await generalHandler(ctx, `${sa.base}. Write it as a ${/phone|call|voicemail/i.test(mm[1]) ? "phone call" : /meeting|person|face/i.test(mm[1]) ? "in-person meeting" : mm[1].toLowerCase()} script. ${text}`), intent: "general" }; }
  }
  if (!ctx.state.pending && /^(?:please |can you |could you |hey )?(?:give|write|draft|make|create|get|help)\s+me\s+(?:a |an |some |with )?(?:script|talking points|word ?track|pitch)\b|\bwhat (?:do|should|can) i say\b/i.test(text)) {
    const medium = /\b(phone|call|voicemail|meeting|in[- ]person|face[- ]to[- ]face|text|sms|email|presentation)\b/i.test(text);
    if (medium) return { out: await generalHandler(ctx, text), intent: "general" };
    const base = text.replace(/[.?!\s]+$/, "");
    ctx.state.script_ask = { base, at: Date.now() };
    await persistState(ctx);
    return { out: reply("What kind of script do you need?", [{ type: "choice", title: "Pick one and I'll write it", buttons: [
      { label: "📞 Phone call", style: "primary", action: { type: "prompt", text: `${base}. Write it as a phone call script.` } },
      { label: "🤝 In-person meeting", style: "secondary", action: { type: "prompt", text: `${base}. Write it as an in-person meeting script.` } },
      { label: "💬 Text message", style: "secondary", action: { type: "prompt", text: `${base}. Write it as a short text message script.` } },
      { label: "✉️ Email", style: "secondary", action: { type: "prompt", text: `${base}. Write it as an email script.` } },
    ] }], "smalltalk"), intent: "smalltalk" };
  }
  const pend = ctx.state.pending;
  let forced: Intent | null = null; // an answer to Mila's question continues THAT request, whatever the merged text looks like
  let answering: { intent: string; missing: string } | null = null;

  if (pend?.kind === "stale_comms" && text) {
    if (isYes(text)) return { out: await resolveStale(ctx, pend.event_id, "update"), intent: "move_event" };
    if (isNo(text)) return { out: await resolveStale(ctx, pend.event_id, "leave"), intent: "smalltalk" };
  }
  if (pend?.kind === "clarify" && text) {
    const d = detectIntent(text);
    const words = text.split(/\s+/).length;
    // A reply continues the open question only if it looks like an answer. A different request ("remind me to call Dana") or a
    // question moves on — the old question is dropped, never allowed to swallow what the agent actually said.
    const timeLike = !!(parseTime(text) || parseDate(text, ctx.now, ctx.tz));
    const miss = String(pend.missing ?? "");
    // "They said 2" / "2" / "around 2:30" answering "what time?": pull the number out and read it as a time (2 means 2 PM)
    const WORDNUM: Record<string, string> = { two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12" };
    const numText = miss === "time" ? text.replace(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (w) => WORDNUM[w.toLowerCase()]) : text;
    const numTime = miss === "time" && words <= 8 && !/\d\s*(?:[ap]\.?m|o.?clock)|\d:\d\d/i.test(text) ? /(?:^|[^\d:])(1[0-2]|[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d:]|\s*(?:st|nd|rd|th|people|bed|bath|min|hour|hr|day|week))/i.exec(numText) : null;
    if (numTime) text = `at ${numTime[1]}${numTime[2] ? ":" + numTime[2] : ""}${numTime[3] ?? (/\b(afternoon|evening|night)\b/i.test(text) ? "pm" : /\bmorning\b/i.test(text) ? "am" : "")}`;
    const looksLikeAnswer = d.intent === pend.intent
      || ((d.intent === "general" || d.intent === "smalltalk") && (words <= 3 || (miss === "time" || miss === "date" ? timeLike : miss === "location" || miss === "address" || miss === "details" ? words <= 8 || !!parseAddress(text) : timeLike)))
      || (words <= 4 && timeLike);
    if (looksLikeAnswer && !/\?\s*$/.test(text)) {
      text = dropNegatedDate(text);
      const orig = overrideWhen((pend.slots as { text: string }).text, text, ctx.now, ctx.tz);
      // a bare "12" / "2:30" answering "what time?" means "at 12" / "at 2:30"
      const bareTime = pend.missing === "time" && /^\s*\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?\s*$/i.test(text);
      text = `${orig} ${bareTime ? "at " : ""}${text}`;
      forced = pend.intent as Intent;
      answering = { intent: String(pend.intent), missing: String(pend.missing ?? "") };
      ctx.state.pending = null;
    } else ctx.state.pending = null;
  } else if (pend && text && pend.kind !== "stale_comms") {
    // a new request supersedes an unanswered choice
    ctx.state.pending = null;
  }

  if (docs.length) return { out: await handleAttachments(ctx, docs, text), intent: "signin_paste" };

  // "Actually make that 4" / "no, Sunday" / "sorry 4pm" right after Mila put something on the calendar means: change THAT event.
  if (!forced && !pend && ctx.state.last_event_id && text.split(/\s+/).length <= 8) {
    text = text.replace(/\s+(?:instead|though|please|pls)\s*[.!]*$/i, "");
    const m = /^(?:(?:actually|no|nope|wait|oops|sorry|hmm|ok(?:ay)?|um|i\s+meant|i\s+mean)[,.!\s]+)*(?:(?:can we |could we |let'?s |lets )?(?:make|do|change|move|push|switch|say)\s+(?:it|that|this)(?:\s+(?:to|at|for))?|it'?s|its|how about|what about|at|for|to)?\b\s*(.+?)[.!\s]*$/i.exec(text);
    const rest = m?.[1]?.trim();
    if (rest && /^(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?|noon|(?:today|tomorrow|tonight|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)[a-z]*(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)?)$/i.test(rest) && (parseTime(rest) || parseDate(rest, ctx.now, ctx.tz) || /^\d{1,2}$/.test(rest))) {
      const when = /^\d{1,2}$/.test(rest) ? `at ${rest}` : rest;
      return { out: await dispatch(ctx, "move_event", `move that to ${when}`, true), intent: "move_event" };
    }
  }

  // "Look for apartments with the specified criteria" a minute after a client brief means: do THAT search, not something about a saved contact.
  const prior = ctx.state.last_search;
  if (!forced && !pend && prior && Date.now() - prior.at < 6 * 3_600_000 && text.split(/\s+/).length <= 20 && !parseAddress(text)
    && (/\b(specified|those|these|their|same|above|earlier|that)\b.{0,20}\b(criteria|requirements|needs|preferences|list|brief)\b/i.test(text) || /^(?:(?:ok|okay|yes|yeah|please|pls|go ahead|do it|now|great|cool|perfect)[,.!\s]+)*(?:search|look|find|dig|go|try)\b.{0,50}\b(again|more|deeper|apartments?|rentals?|properties|options|them|it|for them|those)\b/i.test(text))) {
    return { out: await clientSearchHandler(ctx, `${prior.text}\n\nFollow-up from the agent: ${text}`), intent: "client_search" };
  }

  // "help" / "what can you do": a real answer, not "I'm not sure how to do that"
  if (!forced && !pend && /^(help|help me|what can you do|what do you do|what can i ask( you)?|how does this work|how do i use (this|you))[\s?!.]*$/i.test(text.trim())) {
    return { out: reply("📌 Here's what I can do for you. Just type it like you'd text a coworker:", [{ type: "choice", title: "Try one", buttons: [
      { label: "📅 Add a showing", style: "secondary", action: { type: "prompt", text: "Showing at 123 Main Street tomorrow at 2pm with the Smiths" } },
      { label: "🏡 Set up an open house", style: "secondary", action: { type: "prompt", text: "I have an open house at 123 Main Street Sunday at 1 PM. Set everything up." } },
      { label: "👤 Add a new buyer", style: "secondary", action: { type: "prompt", text: "I have a new buyer named Sarah looking for a 3 bedroom house around $650k" } },
      { label: "✅ Who to follow up with", style: "secondary", action: { type: "prompt", text: "Who do I need to follow up with today?" } },
      { label: "📸 Make a post", style: "secondary", action: { type: "prompt", text: "Make me an Instagram post for my newest listing" } },
    ] }], "smalltalk"), intent: "smalltalk" };
  }

  // "no her name is Dana Whitford" right after saving someone: fix THAT contact's name instead of starting something new
  const rename = !forced && !pend && ctx.state.last_contact_ids?.length === 1 ? /^(?:no[,.\s]+|sorry[,.\s]+|oops[,.\s]+)?(?:her|his|their|the)?\s*name\s*(?:is|'s)\s+(?:actually\s+)?([\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){0,2})\s*[.!]*$/iu.exec(text.trim()) : null;
  if (rename && plausibleName(rename[1])) {
    const c = await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids![0]);
    if (c) {
      const name = rename[1].replace(/(^|\s)(\p{L})/gu, (_m, sp: string, ch: string) => sp + ch.toUpperCase());
      await ctx.store.update("contacts", ctx.userId, c.id, { name });
      return { out: reply(`Fixed. ${c.name} is now ${name}.`, [], "smalltalk"), intent: "smalltalk" };
    }
  }

  // "What did I just schedule?" answers from the last thing Mila put on the calendar
  if (!forced && ctx.state.last_event_id && /^(?:what|which)\b.{0,20}\b(?:did|have) i\b.{0,12}\b(?:schedule|add|book|put|set)\w*\b/i.test(text)) {
    const ev = await ctx.store.get("calendar_events", ctx.userId, ctx.state.last_event_id);
    if (ev) return { out: reply(`The last thing I added: ${ev.title}, ${fmtDayTime(ev.start_at, ctx.tz)}.`, [eventCard(ctx, ev, "Scheduled")], "smalltalk"), intent: "smalltalk" };
  }

  const clauses = splitClauses(text);
  const outs: HandlerOut[] = [];
  let lastIntent: Intent = "general";
  for (const [ci, clause] of clauses.entries()) {
    if (ci > 0 && /^(?:and |then |also |please )?(?:get me |help me |can you |could you )?(?:prep(?:are)?|get (?:me )?ready|get (?:me )?prepared)\b.{0,30}\b(?:it|that|this|them|the showing)\b/i.test(clause.trim()) && ctx.state.last_event_id) {
      const ev = await ctx.store.get("calendar_events", ctx.userId, ctx.state.last_event_id);
      const place = ev?.location || (ev ? parseAddress(ev.title) : null);
      if (place) { lastIntent = "prep_property"; outs.push(await dispatch(ctx, "prep_property", `prep ${place}`, true)); continue; }
    }
    let d = ci === 0 && forced ? { intent: forced, declared: false } : detectIntent(clause);
    if (d.intent === "general") d = (await llmClassify(ctx, clause)) ?? d;
    lastIntent = d.intent;
    outs.push(await dispatch(ctx, d.intent, clause, !!d.declared));
  }
  // NEVER LOOP: if the agent answered a question and the very same question comes back (identical wording, or a third ask in a row), stop asking.
  // Say what's needed, once, and drop it. A question that has moved on ("what time on Sunday?" → "what time today?") is progress, not a loop.
  if (answering && ctx.state.pending?.kind === "clarify" && ctx.state.pending.intent === answering.intent && String(ctx.state.pending.missing ?? "") === answering.missing) {
    const key = `${answering.intent}|${answering.missing}`;
    const streak = (ctx.state.clarify_streak?.key === key ? ctx.state.clarify_streak.n : 0) + 1;
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const prevQ = [...(await recentHistory(ctx))].reverse().find((m) => m.role === "assistant")?.content ?? "";
    if (norm(outs[0]?.text ?? "") === norm(prevQ) || streak >= 2) {
      ctx.state.pending = null; ctx.state.asked_location = null; ctx.state.clarify_streak = null;
      const HINT: Record<string, string> = { location: "Send the address with its city, like “1231 Main Street, Gaithersburg MD”.", address: "Send the street address, like “123 Main Street”.", time: "Send it all in one line, like “Showing at 456 Oak Lane Sunday at 3 PM”.", date: "Send it all in one line, like “Inspection Friday at 10 AM”.", name: "Send their full name, like “Dana Whitfield”." };
      outs.length = 0;
      outs.push(reply(`I couldn't make that out, and I don't want to keep asking, so I haven't changed anything. ${HINT[answering.missing] ?? "Send me the whole request in one message and I'll take it from there."}`, [], "smalltalk"));
    } else ctx.state.clarify_streak = { key, n: streak };
  } else ctx.state.clarify_streak = null;
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
  if (["general", "recall", "find_contacts", "save_memory", "market", "priorities"].includes(intent)) {
    const known = await mentionedContacts(ctx, text);
    if (known.length) { const u = await clientUpdateHandler(ctx, text, known); if (u) return u; }
  }
  switch (intent) {
    case "listing_agreement": return listingAgreementHandler(ctx, text);
    case "pet_check": return petCheckHandler(ctx, text);
    case "client_search": return clientSearchHandler(ctx, text);
    case "time_off": return timeOffHandler(ctx, text);
    case "add_listing": return addListingHandler(ctx, text);
    case "prep_property": return prepPropertyHandler(ctx, text);
    case "listing_ready": return listingReadyHandler(ctx, text);
    case "meeting_prep": return meetingPrepHandler(ctx, text);
    case "showing_followups": return showingFollowupsHandler(ctx, text);
    case "what_missing": return whatMissingHandler(ctx, text);
    case "new_listings": return newListingsHandler(ctx, text);
    case "transaction": return transactionHandler(ctx, text);
    case "closed_deal": return closedDealHandler(ctx, text);
    case "log_interaction": return logInteractionHandler(ctx, text);
    case "draft_text": return draftTextHandler(ctx, text);
    case "week_overview": return weekOverviewHandler(ctx);
    case "pipeline_value": return pipelineHandler(ctx, text);
    case "showing_sheet": return showingSheetHandler(ctx, text);
    case "update_listing": return updateListingHandler(ctx, text);
    case "agenda": return agendaHandler(ctx, text);
    case "undo": return undoHandler(ctx);
    case "open_house": return openHouseHandler(ctx, text);
    case "move_event": return moveEventHandler(ctx, text, declared);
    case "cancel_event": return cancelEventHandler(ctx, text);
    case "create_event": return createEventHandler(ctx, text);
    case "reminder": return reminderHandler(ctx, text);
    case "new_contact": {
      // "I just talked to Priya, she wants…" about someone already saved is a call to log, not a new person
      if (/\b(?:talked|spoke|met|ran into)\b/i.test(text) && (await mentionedContacts(ctx, text)).length) return logInteractionHandler(ctx, text);
      return newContactHandler(ctx, text);
    }
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

/** A long how-to or script answer becomes a tidy card (one step per row, copy button) instead of a wall of text. */
function adviceCard(ask: string, answer: string, who?: { name: string; phone?: string | null }): { lead: string; block: Block } | null {
  const paras = answer.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  if (answer.length < 380 || paras.length < 3) return null;
  const script = /\b(script|what (?:do|should|can) i say|negotiat|talking points)\b/i.test(ask);
  const lead = paras[0].length <= 220 ? paras[0] : script ? "Here's a script you can use." : "Here's the short version.";
  const rest = paras[0].length <= 220 ? paras.slice(1) : paras;
  const steps = rest.slice(0, 8).map((x) => {
    const m = /^(?:\*\*([^*]{2,60})\*\*[:\s-]*|(#{1,4}\s*)?([A-Z][^.\n]{2,50}):\s*)([\s\S]*)$/.exec(x);
    const clean = (t: string) => t.replace(/\*\*/g, "").replace(/^[-•*]\s+/gm, "• ").trim();
    return m && (m[1] || m[3]) && m[4].trim() ? { heading: (m[1] ?? m[3]).trim(), body: clean(m[4]) } : { body: clean(x) };
  });
  const buttons: ActionButton[] = who && script ? [
    { label: `✉️ Make it an email to ${who.name.split(" ")[0]}`, style: "secondary", action: { type: "prompt", text: `Draft an email to ${who.name}: ${ask}` } },
    ...(who.phone ? [{ label: `💬 Make it a text to ${who.name.split(" ")[0]}`, style: "secondary" as const, action: { type: "prompt" as const, text: `Draft a text to ${who.name}: ${ask}` } }] : []),
  ] : [];
  return { lead, block: { type: "advice", title: script ? "Your script" : "How it works", kicker: script ? "Say it" : "Good to know", steps, copy: rest.join("\n\n").replace(/\*\*/g, ""), buttons } };
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
  if (ai) {
    const card = adviceCard(text, ai.text, known[0]);
    if (card) return reply(card.lead, [card.block, ...(ai.suggestions.length ? [{ type: "choice" as const, title: "Want me to…", buttons: ai.suggestions.map((s, i) => ({ label: s.label, style: i === 0 ? ("primary" as const) : ("secondary" as const), action: { type: "prompt" as const, text: s.prompt } })) }] : [])], /\b(plan|strategy|analy|compare|negotiat)/i.test(text) ? "chat_complex" : "chat_simple");
  }
  if (ai) return reply(ai.text, ai.suggestions.length ? [{ type: "choice", title: "Want me to…", buttons: ai.suggestions.map((s, i) => ({ label: s.label, style: i === 0 ? ("primary" as const) : ("secondary" as const), action: { type: "prompt", text: s.prompt } })) }] : [], /\b(plan|strategy|analy|compare|negotiat)/i.test(text) ? "chat_complex" : "chat_simple");
  await logError({ source: "unhandled", level: "info", message: text.slice(0, 300), userId: ctx.userId, email: ctx.profile.email });
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
    case "prompt": { const r = await runText(ctx, String(a.text ?? "").slice(0, 6000), []); return r.out; }
    case "approve":
    case "reject": {
      const r = await decideApproval(ctx, String(a.id), a.type);
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
      const ev = await ctx.store.get("calendar_events", ctx.userId, String(a.eventId));
      if (!ev) return reply("I couldn't find that event.", [], "smalltalk");
      const s = new Date(a.start), e = new Date(a.end);
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || e.getTime() <= s.getTime()) return reply("That time isn't valid, so I haven't moved anything.", [], "smalltalk");
      return applyMove(ctx, ev, s, e, !!a.declared, !!a.ignoreConflicts);
    }
    case "answer_questions": return saveAnswers(ctx, String(a.contactId), (a.answers ?? {}) as Record<string, string>);
    case "listing_worksheet_start": return worksheetForm(ctx, String(a.propertyId));
    case "listing_worksheet": return saveWorksheet(ctx, String(a.propertyId), (a.answers ?? {}) as Record<string, string>);
    case "set_pets": return setPets(ctx, String(a.propertyId), String(a.policy ?? "Pets allowed"));
    case "shift_events": return shiftEvents(ctx, (a.eventIds ?? []).map(String), String(a.after));
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
    case "save_listing": return saveListingCard(ctx, (a.card ?? {}) as Record<string, unknown>);
    case "save_rental": return saveRentalCard(ctx, a.card);
    case "save_rentals_for": return saveRentalsForClient(ctx, String(a.contactId), a.cards);
    case "event_reminder": return eventReminder(ctx, String(a.eventId), Number(a.minutes) || 60, a.title ? String(a.title) : undefined);
    case "listing_checklist": return listingChecklist(ctx, String(a.propertyId));
    case "tag_contact": {
      const r = (await (await import("./tools")).TOOLS.update_contact.run(ctx, { id: a.contactId, patch: { tags: [String(a.tag).slice(0, 40)] }, eventTitle: `Also a ${String(a.tag).slice(0, 40)}`, eventKind: "note" })) as any;
      return reply(r.ok ? `Done — added "${a.tag}" to ${r.data.contact.name}'s profile.` : "I couldn't find that contact.", [], "smalltalk");
    }
    case "quick_task": {
      const r = (await (await import("./tools")).TOOLS.create_task.run(ctx, { kind: "follow_up", title: String(a.title ?? "Follow up").slice(0, 200), subtitle: a.subtitle ? String(a.subtitle).slice(0, 300) : undefined, contact_id: typeof a.contactId === "string" && (await ctx.store.get("contacts", ctx.userId, a.contactId)) ? a.contactId : undefined, due_at: new Date(ctx.now.getTime() + 24 * 3_600_000).toISOString() })) as any;
      return reply(r.ok ? "Added to your tasks." : r.message, [], "smalltalk");
    }
    default: return reply("I'm not sure what that button does yet.", [], "smalltalk");
  }
}

export type { CalendarEvent };
export { firstName, aiAvailable, randomUUID };
