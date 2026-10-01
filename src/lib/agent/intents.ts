export type Intent =
  | "open_house" | "move_event" | "cancel_event" | "create_event" | "reminder" | "new_contact" | "priorities" | "market"
  | "debrief" | "find_contacts" | "signin_paste" | "batch_followups" | "social_post" | "draft_email" | "recall" | "save_memory"
  | "find_property" | "smalltalk" | "general";

export const INTENTS: Intent[] = ["open_house", "move_event", "cancel_event", "create_event", "reminder", "new_contact", "priorities", "market", "debrief", "find_contacts", "signin_paste", "batch_followups", "social_post", "draft_email", "recall", "save_memory", "find_property", "smalltalk", "general"];

export interface Detected { intent: Intent; declared?: boolean }

/** Rule-based router: free, instant, handles the common real-estate requests. */
export function detectIntent(raw: string, hasAttachments = false): Detected {
  const t = raw.toLowerCase().trim();
  if (!t && hasAttachments) return { intent: "signin_paste" };
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening)|thanks|thank you|thx|ok|okay|cool|great|got it)[\s!.,]*(mila)?[\s!.]*$/.test(t)) return { intent: "smalltalk" };

  const moveVerb = /\b(move|moved|moving|reschedule|rescheduled|push|pushed|change|changed|postpone|postponed|shift|shifted|switch|switched)\b/;
  const past = /\bi\s+(?:just\s+)?(moved|rescheduled|changed|pushed|postponed|shifted|switched)\b|\bit(?:'s| is| has been)\s+(?:been\s+)?(moved|rescheduled|changed)\b|\b(?:got|has been|was)\s+(moved|rescheduled|changed)\b/.test(t);
  const eventNoun = /\b(open house|showing|tour|appointment|meeting|call|lunch|closing|inspection|walkthrough|event|consult)/;

  if (/\bsign.?in\b|\bvisitor list\b|\battendee/.test(t) && !/follow.?up|draft/.test(t)) return { intent: "signin_paste" };
  if (/\b(follow.?ups?|emails?|messages?|notes?)\b.*\b(for|to)\b.*\b(everyone|everybody|all of them|all (?:of )?(?:the )?(?:people|visitors|attendees)|each|who came|who attended|who visited|who signed)/.test(t) || /\b(everyone|everybody)\b.*\b(came|attended|visited|signed)/.test(t) || /follow.?ups?.*\b(open house|sign.?in)/.test(t) && /\b(draft|write|prepare|create)\b/.test(t)) return { intent: "batch_followups" };

  if (/\bcancel\b/.test(t) && eventNoun.test(t)) return { intent: "cancel_event" };
  if (moveVerb.test(t) && eventNoun.test(t) && /\b(to|until|for|from)\b/.test(t)) return { intent: "move_event", declared: past };
  if (/\bremind me\b|\bset (?:a )?reminder\b/.test(t)) return { intent: "reminder" };
  if (/open house/.test(t) && /\b(have|hosting|host|holding|set up|setup|plan|planning|prepare|schedule|organize|scheduled|this|next|on|at)\b/.test(t) && !/instagram|facebook|post|carousel|tiktok/.test(t)) return { intent: "open_house" };
  if (/(instagram|facebook|tiktok|linkedin|twitter|\bx post\b|social)\b/.test(t) && /(post|carousel|caption|reel|content|story)/.test(t)) return { intent: "social_post" };
  if (/\b(schedule|book|set up|add|put|create)\b/.test(t) && eventNoun.test(t)) return { intent: "create_event" };
  if (/\b(new|got a|have a|met a|meeting a|signed|add)\b.*\b(buyer|seller|renter|tenant|investor|lead|client|prospect)\b/.test(t) || /\badd\b.+\bas (a |an )?(buyer|seller|lead|renter|investor|client)\b/.test(t)) return { intent: "new_contact" };
  if (/\bwho\b.*\b(follow|reach out|contact|call|text|email|check in)\b|\b(follow.?ups?|to.?do|on my plate|need(?:s)? my attention|priorit)\b.*\b(today|now|first|this week)\b|\bwhat should i (?:do|work on)\b|\bwhat do i need to (?:do|get done)\b|\bwhat'?s (?:on|next)\b.*\b(today|plate)\b|^who do i need/.test(t)) return { intent: "priorities" };
  if (/\b(debrief|brief me|catch me up|summary of my day|daily summary|morning brief|my day)\b/.test(t)) return { intent: "debrief" };
  if (/\b(market|inventory|home prices?|home values?|days on market|median|mortgage rates?|interest rates?|housing)\b|what'?s happening in|what are buyers seeing|trends? in\b/.test(t)) return { intent: "market" };
  if (/\b(find|show|search|get|list)\b.*\b(something|homes?|houses?|listings?|properties|condos?|townhomes?)\b.*\bfor\b|\bfind something for\b/.test(t)) return { intent: "find_property" };
  if (/\b(find|show|list|search|who are)\b.*\b(contacts?|buyers|sellers|leads|investors|renters|clients|people)\b|^(show|list) (me )?(my )?(buyers|sellers|leads|contacts)/.test(t)) return { intent: "find_contacts" };
  if (/\b(what do you know about|tell me about|what('?s| is) .*(preferences?|looking for)|what does .* (want|like))\b/.test(t) && /\b[a-z]+\b/.test(t) && /(about|does|preferences)/.test(t)) return { intent: "recall" };
  if (/\b(remember that|remember:|note that|keep in mind)\b/.test(t)) return { intent: "save_memory" };
  if (/\b(draft|write|compose|send|prepare)\b.*\b(email|message|note|follow.?up|text)\b/.test(t) || /\bemail\b.+\b(about|regarding)\b/.test(t)) return { intent: "draft_email" };
  if (hasAttachments) return { intent: "signin_paste" };
  if (/^[^\n]+(,|\t)[^\n]*@[^\n]+/m.test(raw) && raw.split("\n").length >= 2) return { intent: "signin_paste" };
  return { intent: "general" };
}
