import type { Block } from "../types";
import type { Intent } from "./intents";

/**
 * "What next?" chips under an answer. Each one is a ready-to-send sentence in the agent's own voice. Tapping one fills the message box
 * (nothing is sent until they tap send), so they can finish the blank at the end ("…on ") or just send it. Every line is a phrase Mila already handles.
 * Simple answers (a lookup, a thank-you, a yes/no) get none; everything else points to the one or two sensible next steps.
 */
export interface FollowUpContext { name?: string; addr?: string }
type Item = { label: string; text: string };
const it = (label: string, text = label): Item => ({ label, text });

const WEEK = it("How does my week look?");
const WHO = it("Who should I follow up with?");
const MISSING = it("What am I missing?");

const SIMPLE = new Set<string>(["smalltalk", "undo", "event_outcome", "contact_question", "basics", "recall", "refuse_injection", "reminder_done", "cancel_reminder", "list_reminders", "deactivate_contact", "delete_data", "save_memory", "oh_attendance"]);

function byIntent(intent: string, c: FollowUpContext): Item[] {
  const who = c.name, home = c.addr;
  switch (intent) {
    case "create_event": case "client_meeting": return [it("Remind me an hour before"), ...(who ? [it(`Text ${who} to confirm`)] : []), it("Prep notes for this meeting", "What should I prepare for this?")];
    case "move_event": return [...(who ? [it(`Text ${who} the new time`)] : []), WEEK];
    case "cancel_event": return [...(who ? [it(`Text ${who} that I need to reschedule`)] : []), it("Find a new time", "Find a new time for it")];
    case "reminder": return [it("Add another reminder", "Remind me tomorrow at 9am to "), WEEK];
    case "new_contact": return [...(who ? [it(`Text ${who} an intro`), it(`Set a follow-up for ${who}`, `Remind me to follow up with ${who} on `)] : []), it("Add their budget and areas", `${who ? `${who}'s` : "Their"} budget is `)];
    case "contact_field_update": return [...(who ? [it(`Find homes for ${who}`), it(`Text ${who}`, `Text ${who} `)] : []), WHO];
    case "draft_text": return [it("Make it warmer"), it("Make it shorter"), ...(who ? [it(`Email ${who} instead`, `Email ${who} instead`)] : [])];
    case "draft_email": return [it("Make it shorter"), it("Make it warmer"), it("Add a P.S.", "Add a P.S. that "), ...(who ? [it(`Text ${who} instead`, `Text ${who} instead`)] : [])];
    case "social_post": case "themed_post": case "rewrite_post": case "another_version": return [it("Make it funnier"), it("Write another version"), it("Schedule it", "Schedule that post for ")];
    case "calc": return [it("What if rates drop?", "What if rates drop to "), it("Try a different down payment", "What if they put 20% down?"), ...(who ? [it(`Text this to ${who}`, `Text ${who} these numbers`)] : [])];
    case "add_listing": case "update_listing": return [it("Make a Just Listed post", home ? `Make a Just Listed post for ${home}` : "Make a Just Listed post"), it("Set up an open house", home ? `Set up an open house at ${home}` : "Set up an open house"), MISSING];
    case "prep_property": case "describe_home": return [it("Make a post for it", home ? `Make an Instagram post for ${home}` : "Make an Instagram post"), it("Set up an open house", home ? `Set up an open house at ${home}` : "Set up an open house"), MISSING];
    case "open_house": return [WEEK, it("Make the open house post", "Make an open house post"), it("Invite my contacts", "Draft an open house invite email")];
    case "agenda": case "week_overview": return [WHO, it("Block time for prospecting", "Block off 2 hours for prospecting on "), MISSING];
    case "priorities": return [WEEK, MISSING];
    case "showing_followups": case "debrief": return [WEEK, WHO];
    case "market": case "client_search": return [it("Turn this into a text", "Turn this into a short text I can send"), it("Make a post from this", "Make an Instagram post from this")];
    case "transaction": case "offer_received": case "closed_deal": return [it("What are my deadlines?", "What deadlines should I put on my calendar?"), it("Text the client an update", "Draft a text updating the client")];
    default: return [];
  }
}

/** A follow-up block for this answer, or null. Skipped for simple answers, when the answer already asks something, or when it already has choices to make. */
export function followUpBlock(intent: Intent | string, blocks: Block[], text: string, ctx: FollowUpContext = {}): Block | null {
  if (SIMPLE.has(intent) || text.length < 12) return null;
  const waiting = blocks.some((b) => b.type === "questions" || b.type === "followups" || (b.type === "choice" && !/^Want me to/i.test(b.title)) || b.type === "replaced");
  if (waiting || /\?\s*$/.test(text.trim())) return null;
  const items = byIntent(intent, ctx).slice(0, 3);
  if (!items.length) return null;
  return { type: "followups", title: "Next", items };
}
