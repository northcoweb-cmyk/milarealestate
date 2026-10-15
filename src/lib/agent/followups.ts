import type { Block } from "../types";
import type { Intent } from "./intents";

/** Suggested next questions under an answer, only where they genuinely follow from it. Every line is a phrase Mila already handles well (the quick-start chips on Home), never a guess. */
const WEEK = { label: "How does my week look?", text: "How does my week look?" };
const WHO = { label: "Who should I follow up with?", text: "Who should I follow up with?" };
const MISSING = { label: "What am I missing?", text: "What am I missing?" };
const OPEN_HOUSE = { label: "Set up an open house", text: "Set up an open house" };

const BY_INTENT: Partial<Record<Intent, { label: string; text: string }[]>> = {
  agenda: [WEEK, WHO],
  week_overview: [WHO, MISSING],
  priorities: [WEEK, MISSING],
  create_event: [WEEK],
  move_event: [WEEK],
  cancel_event: [WEEK],
  new_contact: [WHO],
  add_listing: [MISSING, OPEN_HOUSE],
  prep_property: [MISSING, OPEN_HOUSE],
  open_house: [WEEK, WHO],
  showing_followups: [WEEK],
};

/** A follow-up block for this answer, or null. Skipped when the answer already asks the person something or has buttons to press. */
export function followUpBlock(intent: Intent | string, blocks: Block[], text: string): Block | null {
  const items = BY_INTENT[intent as Intent];
  if (!items || text.length < 12) return null;
  const busy = blocks.some((b) => b.type === "choice" || b.type === "questions" || b.type === "followups" || b.type === "draft_email" || b.type === "draft_social" || b.type === "post_set" || b.type === "workflow" || (("buttons" in b) && Array.isArray((b as { buttons?: unknown[] }).buttons) && ((b as { buttons?: unknown[] }).buttons?.length ?? 0) > 0));
  if (busy || /\?\s*$/.test(text.trim())) return null;
  return { type: "followups", title: "Next", items };
}
