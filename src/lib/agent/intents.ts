import { portalAsk, productTopic, vagueBulk, unsureWho, propertyFieldAsk, propertyListAsk } from "./handlers/product-help";
import { calcKind } from "./handlers/calc";
import { basicsKind } from "./handlers/basics";
import { adviceTopic } from "./handlers/advice";
import { describeHomeAsk, detailsFollowupAsk, listDateAsk, offerAsk, propertyNoteAsk, statusAsk } from "./handlers/property-ops";
import { parseAddress, parseDate, parseTime } from "./nlu";

export type Intent =
  | "move_day" | "client_summary" | "past_client_note" | "basics" | "refuse_injection" | "advice" | "another_version" | "describe_home" | "inbox_query" | "oh_attendance" | "calc" | "portal_request" | "rewrite_post" | "related_contact" | "revise_draft" | "property_status" | "list_date" | "offer_received" | "property_note" | "property_details" | "ooo_query" | "ooo_edit" | "list_reminders" | "reminder_done" | "add_task" | "cancel_reminder" | "contact_field_update" | "property_fact" | "vague_bulk" | "unsure_who" | "product_help" | "oh_recap" | "client_lost" | "deactivate_contact" | "pre_departure" | "replace_event" | "listing_agreement" | "pet_check" | "client_search" | "prep_property" | "meeting_prep" | "showing_followups" | "listing_ready" | "what_missing" | "new_listings" | "transaction" | "closed_deal" | "log_interaction" | "draft_text" | "week_overview" | "pipeline_value" | "add_listing" | "time_off" | "open_house" | "move_event" | "cancel_event" | "create_event" | "reminder" | "new_contact" | "priorities" | "market"
  | "debrief" | "find_contacts" | "signin_paste" | "batch_followups" | "social_post" | "draft_email" | "email_audience" | "recall" | "save_memory"
  | "find_property" | "delete_data" | "listing_link" | "showing_sheet" | "agenda" | "update_listing" | "undo" | "smalltalk" | "general";

export const INTENTS: Intent[] = ["move_day", "past_client_note", "basics", "refuse_injection", "client_summary", "advice", "another_version", "describe_home", "inbox_query", "oh_attendance", "calc", "portal_request", "property_status", "list_date", "offer_received", "property_note", "property_details", "ooo_query", "ooo_edit", "list_reminders", "reminder_done", "revise_draft", "related_contact", "rewrite_post", "add_task", "cancel_reminder", "contact_field_update", "property_fact", "vague_bulk", "unsure_who", "product_help", "oh_recap", "client_lost", "deactivate_contact", "pre_departure", "replace_event", "listing_agreement", "pet_check", "client_search", "prep_property", "meeting_prep", "showing_followups", "listing_ready", "what_missing", "new_listings", "transaction", "closed_deal", "log_interaction", "draft_text", "week_overview", "pipeline_value", "add_listing", "time_off", "open_house", "move_event", "cancel_event", "create_event", "reminder", "new_contact", "priorities", "market", "debrief", "find_contacts", "signin_paste", "batch_followups", "social_post", "draft_email", "email_audience", "recall", "save_memory", "find_property", "delete_data", "listing_link", "showing_sheet", "agenda", "update_listing", "undo", "smalltalk", "general"];

export interface Detected { intent: Intent; declared?: boolean }

const STREET = /\b\d{1,6}\s+(?!(?:a\.?m|p\.?m)\b)[a-z0-9'.]+(?:\s+[a-z0-9'.]+){0,3}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|boulevard|pl|place|ter|terrace|cir|circle|pkwy|parkway|hwy|highway|trl|trail|loop|plaza|square|row|pike|path|run|park)\b/;


/** A multi-requirement search brief for clients: several criteria, something to find, and a kind of place. Exported for tests. */
export function isClientSearch(raw: string): boolean {
  const t = raw.toLowerCase();
  if (STREET.test(t)) return false; // a specific address is a different job (prep, listing, open house)
  const wants = /\b(find|search|look(?:ing)? (?:for|to)|looking to (?:get|rent|buy|lease|move)|recommend|suggest|best|shortlist|options|where should|which (?:city|cities|neighborhood|area|building|apartment)|want(?:s)? (?:a|an|to)|need(?:s)? (?:a|an))\b/.test(t);
  const place = /\b(apartments?|rentals?|condos?|town ?homes?|town ?houses?|homes?|houses?|properties|neighborhoods?|cit(?:y|ies)|buildings?|lofts?|relocat\w+|move to|moving to)\b/.test(t);
  const markers = (raw.match(/[•✓✔✅☑]|^\s*[-*]\s|\s\*\s|≤|≥|\bmust\b|\bbudget\b|\bunder \$|\bmax\b|\bwithin\b|\bwalkable\b|\bamenities\b|\bpet[- ]friendly\b|\bbalcony\b|\bparking\b|\bschools?\b/gim) ?? []).length;
  const emoji = (raw.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const clients = /\b(my )?(clients?|buyers?|renters?|customers?|they|couple|family)\b/.test(t);
  const named = /\bnamed\b|\bnew (?:buyer|seller|client|lead|renter)\b|\badd\b/.test(t); // saving a person is a different job
  if (named) return false;
  return wants && place && ((raw.length >= 140 && (markers >= 3 || emoji >= 3 || (clients && markers >= 2))) || (raw.length >= 90 && clients && markers >= 2 && /\b(find|search|options|recommend|suggest|shortlist|which (?:areas|neighborhoods))\b/.test(t)));
}

const OWN_WORK = /\b(open house|showing|appointment|calendar|remind|reminder|draft|write|compose|email|e-mail|text (?:her|him|them|me)|post|caption|carousel|flyer|instagram|sign.?in|follow.?up|my (?:buyers?|leads?|contacts?|clients?|pipeline|listing|week|day))\b/;
const asks = /^(?:what|whats|what's|is|are|does|do|how|which|where|who|find|look|search|show|tell|compare|give|can you|could you|help|pull|check|any)\b|\?\s*$/;

/**
 * Research the agent wants done with outside data: rentals and rent levels, a building or neighbourhood (safety, walkability, schools, reviews,
 * cannabis rules, tours), comparing places for a move, pricing and comps, areas for a type of client. Exported for tests.
 */
/** Fix the typos agents actually make on a phone, so the router sees "showing", not "showinge". */
/** A Spanish request is worked out in English: "Recuérdame mañana a las 9 llamar a Ana" → "remind me tomorrow at 9 call Ana". Only runs when Spanish marker words are present. */
export function normalizeSpanish(raw: string): string {
  if (!/\b(?:recu[eé]rdame|recordarme|ma[nñ]ana|llamar|llama a|cita|mostrar|casa|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|a las \d|programa|agenda)\b/i.test(raw)) return raw;
  const days: Record<string, string> = { lunes: "Monday", martes: "Tuesday", miercoles: "Wednesday", jueves: "Thursday", viernes: "Friday", sabado: "Saturday", domingo: "Sunday" };
  return raw
    .replace(/\ba las\s+(\d{1,2})(?::(\d{2}))?(?:\s+de la\s+(ma[nñ]ana|tarde|noche))?/gi, (_m, h: string, mi: string | undefined, part: string | undefined) => `at ${h}${mi ? ":" + mi : ""}${part ? (/ma/i.test(part) ? " am" : " pm") : ""}`)
    .replace(/\brecu[eé]rdame\b|\brecordarme\b/gi, "remind me")
    .replace(/\bpasado ma[nñ]ana\b/gi, "the day after tomorrow").replace(/\bma[nñ]ana\b/gi, "tomorrow").replace(/\bhoy\b/gi, "today")
    .replace(/\b(?:el|este|el pr[oó]ximo)\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi, (_m, d: string) => days[d.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] ?? d)
    .replace(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi, (_m, d: string) => days[d.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] ?? d)
    .replace(/\bllamar a\b|\bllama a\b|\bllamar\b/gi, "call").replace(/\benviar un correo a\b|\bescribir a\b/gi, "email").replace(/\bcita\b/gi, "appointment").replace(/\breuni[oó]n\b/gi, "meeting");
}

export function fixTypos(raw: string): string {
  return normalizeSpanish(raw)
    .replace(/\b(?:remnd|remnid|remmind|reminde|rmnd|remindme)\b/gi, "remind").replace(/\b(agrmt|agrmnt|agreemnt|agrement)\b/gi, "agreement").replace(/\b(?:appts?|appt\.)\b/gi, "appointment").replace(/\bmtg\b/gi, "meeting")
    .replace(/(\p{Lu}[\p{L}'’-]{0,30})\s+re\s+(?=[a-z])/gu, "$1 about ")
    .replace(/\b(?:showinge|showign|shwoing|showng|showin)\b/gi, "showing")
    .replace(/\b(tmrw|tmr|tomorrow)\s+(\d{1,2})(?![\d:])(?!\s*(?:am|pm|a\.m|p\.m|o'?clock))\b/gi, "tomorrow at $2").replace(/\b(?:abt)\b/gi, "about").replace(/\b(?:cal)\b(?=\s+[A-Z])/g, "call")
    .replace(/\bblock(?:ing)?\s+(?:off|out)\s+((?:this\s+|next\s+)?(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|tomorrow|today)\s+(morning|afternoon|evening)\b/gi, (_m, d: string, part: string) => `Schedule busy time ${d} ${/^morn/i.test(part) ? "8am to 12pm" : /^aft/i.test(part) ? "1pm to 5pm" : "5pm to 8pm"}`)
    .replace(/\bw\/o\b/gi, "without").replace(/\bw\/\s*/gi, "with ")
    .replace(/\b(?:um+|uh+|uhm+|erm+|hmm+)\b[,.]?\s*/gi, "") // dictation filler
    .replace(/\bopen\s*hous\b/gi, "open house").replace(/\b(?:appoitment|apointment|appointmnt)\b/gi, "appointment")
    .replace(/\b(?:meetting|meetng)\b/gi, "meeting").replace(/\b(?:tommorow|tomorow|tmmrw|tomorrrow)\b/gi, "tomorrow")
    .replace(/\b(?:listng|lisitng)\b/gi, "listing").replace(/\ban\s+(showing|listing|open house|offer)\b/gi, (_, w) => `a ${w}`)
    .replace(/\bwent to see (.{0,40}?)\b(tmr|tmrw|tomorrow)\b/gi, "want to see $1$2");
}

export function isResearchTask(raw: string): boolean {
  const t = raw.toLowerCase().trim();
  const rentSearch = /\b(find|search|look(?:ing)?|show|need)\b.{0,60}\b(apartments?|rentals?|places? to rent)\b|\b(apartments?|rentals?)\b.{0,60}\b(under|below|for \$|max|budget)\b/.test(t);
  if (t.length < 12 || (OWN_WORK.test(t) && !rentSearch)) return false;
  const q = asks.test(t);
  const rent = /\b(apartments?|rentals?|for rent|to rent|renting|leas(?:e|ing)|rent (?:estimate|for|prices?|levels?)|rents? (?:are|is|going|in)|going for)\b/.test(t) && /\b(find|search|show|look|what|how much|best|under|compare|where|recommend|estimate|any|going for|\$)\b/.test(t);
  const area = q && /\b(safe|safety|crime|dangerous|walkable|walk score|walkability|schools?|school district|neighbou?rhoods?|noise|flood(?: zone| risk)?|reviews?|what do (?:residents|tenants|people|locals) say|reputation|amenit(?:y|ies)|3d tour|virtual tour|pet[- ]friendly|cannabis|weed|marijuana|commute|cost of living|up[- ]and[- ]coming|best (?:areas?|places?|neighbou?rhoods?|buildings?))\b/.test(t) && !/\b(listing description|say in|fair housing|steer|compliance|my listing|advertis)/.test(t);
  const compare = /\bcompare\b.+\b(?:and|vs\.?|versus|to)\b/.test(t) || /\b(?:moving|relocat\w+|move) (?:from|to)\b/.test(t);
  const pricing = /\b(what should i (?:list|price)|help me price|how (?:should|do) i price|pricing (?:advice|strategy)|cma|comparative market|comps?\b|price per (?:square foot|sq ?ft)|ppsf|what(?:'s| is) (?:it|this|that|[^?]{0,60}) worth|market value of)\b/.test(t);
  const sendsDoc = /\b(?:send|email|text|share|forward|attach)\b.{0,30}\b(?:cma|comps?)\b/.test(t);
  const clientAreas = /\b(investor|retired|first[- ]time|young couple|empty nest|relocat\w+|moving (?:from|to)|family of|client)\b/.test(t) && /\b(what areas|which (?:areas|neighbou?rhoods|cities)|where should|what should (?:i|we) (?:look|show)|find (?:options|some)|neighbou?rhoods)\b/.test(t);
  return rent || area || (compare && q) || (pricing && !sendsDoc) || clientAreas;
}

/** Rule-based router: free, instant, handles the common real-estate requests. */
export function detectIntent(raw: string, hasAttachments = false): Detected {
  const t = raw.toLowerCase().trim();
  if (!t && hasAttachments) return { intent: "signin_paste" };
  if (/\b(?:cma|comparative market analysis)\b/.test(t) && /\b\d{1,6}\s+[a-z]/.test(t) && !/^(?:what|how|why|explain|does|is)\b/.test(t)) return { intent: "market" };
  if (/^(?:please\s+|can you\s+|could you\s+)?(?:move|reschedule|push|shift|bump)\s+(?:everything|all(?: of)?(?: my)?(?: events| appointments| meetings| showings| calls)?)\b.+\b(?:to|onto|until)\b/.test(t)) return { intent: "move_day" };
  if (/^(help|help me|what can you do|what do you do|what can i ask( you)?|how does this work|how do i use (this|you))[\s?!.]*$/.test(t)) return { intent: "smalltalk" };
  if (/^(?:ok(?:ay)?[,.\s]+)?(?:never ?mind|nvm|nm|forget (?:it|that)|scratch that|disregard(?: that)?|ignore that|drop it|skip it|no thanks?)[\s!.]*$/.test(t)) return { intent: "smalltalk" };
  if (/^who (?:is|was|are) (?:the|a|an)\s/.test(t) && !/\b(?:buyer|seller|client|lead|contact|agent|broker|my)\b/.test(t)) return { intent: "general" };
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening)|thanks|thank you|thx|ok|okay|cool|great|got it)[\s!.,]*(mila)?[\s!.]*$/.test(t)) return { intent: "smalltalk" };
  if (vagueBulk(t)) return { intent: "vague_bulk" }; // "send this to everyone now": no audience and no content yet, so ask before anything is drafted
  if (unsureWho(t)) return { intent: "unsure_who" }; // "priya or dana, I forget": ask which one before anything is written
  if (/^(?:(?:please|ok|okay|hey|and|also|actually|now|wait|oh|so)[,\s]+)*(?:update|change|set|correct|fix|edit|bump|raise|lower|increase|move|make)\b.*\b(?:phone|number|cell|mobile|e-?mail|budget)\b.*\bto\b/.test(t) && !/\b(?:reminder|event|showing|calendar|listing|property|price)\b/.test(t)) return { intent: "contact_field_update" };
  if (/^\s*confirmed:/.test(t) || (/^(?:(?:please|ok|okay|hey|and|also)[,\s]+)*(?:change|update|set|correct|fix|edit)\b.*\bprice\b.*\b(?:to|at)\b\s*\$?\d/.test(t) && !!parseAddress(raw))) return { intent: "update_listing" };
  if (!/\?\s*$/.test(t) && /^(?:(?:please|pls|ok|okay|hey|and|also|can you|could you)[,\s]+)*(?:cancel|delete|remove|clear|get rid of|forget)\b/.test(t) && /\breminders?\b/.test(t)) return { intent: "cancel_reminder" };
  if (!/\?\s*$/.test(t) && /^(?:(?:please|pls|ok|okay|hey|and|also|can you|could you)[,\s]+)*(?:add|create|make|put|new|set up)\s+(?:a |an |me a |another )?(?:new )?(?:task|to-?do|todo)\b/.test(t)) return { intent: "add_task" };
  if (!/\?\s*$/.test(t) && /(?:^|[.:!?]\s+)(?:(?:please|pls|ok|okay|hey|and|also|can you|could you)[,\s]+)*(?:rewrite|redo|rework|edit|shorten|trim|change|take)\b/.test(t) && /\b(?:post|caption|carousel|headline)\b/.test(t) && !/\b(?:new|another|second)\b/.test(t) || /\bi need it to say\b/.test(t) && !/\?\s*$/.test(t)) return { intent: "rewrite_post" };
  // "that draft is too generic, rewrite it to say…" / "redo it: …": the message just written is rewritten, not a new request
  if (!/\?\s*$/.test(t) && (/^(?:(?:ok|okay|so|no|wait|please|hey|actually)[,.\s]+)*(?:that|the|this)\s+(?:draft|email|text|message)\b.{0,60}\b(?:too generic|too long|too short|doesn'?t (?:mention|say|include|have)|not right|wrong|needs? to)\b/.test(t) || /^(?:(?:ok|okay|so|no|wait|please|hey|actually|now)[,.\s]+)*(?:rewrite|redo|rework|revise)\s+(?:it|that|the draft|this|the email|the text|the message)\b/.test(t))) return { intent: "revise_draft" };
  if (!/\?\s*$/.test(t) && /\badd\s+.{2,60}?\s+as\s+(?:a\s+)?(?:related\s+contact\s+(?:for|of|to)\b|(?:her|his|their)\s+(?:son|daughter|husband|wife|partner|spouse|mother|father|brother|sister|assistant|attorney|lawyer|accountant)\b)/.test(t)) return { intent: "related_contact" };
  // a home the agent already has: its status, list date, an offer, a note, the details just after adding it
  if (calcKind(raw)) return { intent: "calc" };
  // injection and "show me your prompt" are refused plainly (nothing is sent, nothing is revealed)
  if (/\b(?:system prompt|your (?:hidden )?(?:instructions|rules|prompt)|ignore (?:all |your |any )?(?:previous |prior )?(?:rules|instructions)|reveal your|jailbreak)\b/.test(t)) return { intent: "refuse_injection" };
  // "<clients> closed on their home two years ago and might refer a friend": a note about past clients, not a new deal and not app help
  if (!/\?\s*$/.test(t) && /\b(?:closed|bought|sold|settled)\b[^.?]{0,60}\b(?:\d+|a|one|two|three|four|five|last|several|a few)\s+(?:years?|months?)\s+ago\b/.test(t) && /\p{Lu}[\p{L}'’-]+/u.test(raw.replace(/^\s*\S+/, ""))) return { intent: "past_client_note" };
  // small questions about the agent's own data
  if (basicsKind(raw)) return { intent: "basics" };
  if (!/\?\s*$/.test(t) || /\?\s*$/.test(t)) { if (/^(?:(?:ok|okay|hey|so|and|please|pls|can you|could you)[,\s]+)*(?:(?:give me|show me|write|make|do)\s+(?:me\s+)?(?:a\s+)?(?:summary|brief|rundown|overview)\s+(?:of|on|for|about)|summari[sz]e|brief me on|catch me up on|where (?:do )?(?:things|we) stand with|how(?:'s| is) .{2,40} (?:doing|going)|what(?:'s| is) the (?:plan|next step|status)\s+(?:for|with)|next steps?\s+(?:for|with)|what should i (?:be )?do(?:ing)?\s+(?:with|about|for))\s+\S/i.test(raw) && !/\b(listing|property|house|home|open house|post|calendar|week|day|inbox|pipeline|market)\b/i.test(raw.replace(/\b(?:the|a)\s+\w+\s+family\b/i, "")) ) return { intent: "client_summary" }; }
  if (/^\s*(?:get me ready to list|help me get ready to list|i'?m listing a home)\W*$/i.test(raw)) return { intent: "listing_ready" };
  if (adviceTopic(raw)) return { intent: "advice" };
  if (!/\?\s*$/.test(t) && /^(?:(?:ok|okay|yes|yeah|now|please|and|can you|could you)[,\s]+)*(?:make|give me|do|create|try|show me)\s+(?:me\s+)?(?:another|a different|a new|one more)\s+(?:version|take|option|one)\s*[.!]?$/.test(t)) return { intent: "another_version" };
  if (describeHomeAsk(raw)) return { intent: "describe_home" };
  // inbox questions: Mila does not read email, and says so instead of drafting or refusing something unrelated
  if (/\b(?:in my inbox|my inbox|new emails?|unread (?:emails?|messages?)|emails? from (?:my )?(?:leads|clients|buyers|sellers)|did (?:anyone|\w+) (?:reply|respond|write back|email me))\b/.test(t) && !/\b(?:draft|write|compose|send)\b/.test(t)) return { intent: "inbox_query" };
  // "Add Brielle Haskins as a buyer. She came to the open house…" is a new person, whatever else the sentence mentions
  if (!/\?\s*$/.test(t) && /^\s*(?:(?:please|pls|ok|okay|hey)[,\s]+)*(?:add|new)\b[^.]{0,60}\b(?:as an? |new )(?:buyer|seller|lead|renter|client|investor)\b/i.test(raw) && !/\blisting\b/i.test(raw) && /\p{Lu}[\p{L}'’-]+\s+\p{Lu}[\p{L}'’-]+/u.test(raw) && !/\b(?:post|caption|carousel|instagram)\b/.test(t)) return { intent: "new_contact" };
  // "I had 6 people come through 77 Kentlands on Saturday": attendance for an open house that already happened
  if (!/\?\s*$/.test(t) && /\b(?:i|we) (?:had|got|saw)\s+(?:about |around |roughly )?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a dozen)\s+(?:people|visitors|groups|families|couples|parties|households)\b/.test(t)) return { intent: "oh_attendance" };
  if (propertyNoteAsk(raw)) return { intent: "property_note" };
  if (offerAsk(raw)) return { intent: "offer_received" };
  if (listDateAsk(raw)) return { intent: "list_date" };
  if (statusAsk(raw)) return { intent: "property_status" };
  if (detailsFollowupAsk(raw)) return { intent: "property_details" };
  // time off: asking about the block that exists (never a new block), and editing it in place
  if (/\b(?:out of (?:the )?office|ooo|time off)\b/.test(t)) {
    if (/\b(?:how long|when (?:does|do|is|will)|what (?:are|is)|show|start|starts|end|ends|until|exactly|really|all day|span|how many days)\b/.test(t) && (/\?\s*$/.test(t) || /^(?:show|wait|ok|okay|so)\b/.test(t)) && !/\b(?:schedule|book|add|set up|put)\b/.test(t)) return { intent: "ooo_query" };
    if (/^(?:(?:ok|okay|so|please|can you|could you)[,\s]+)*(?:change|shorten|make|edit|fix|update|adjust|move)\b.*\b(?:out of (?:the )?office|ooo|time off)\b.*\bto\b/.test(t)) return { intent: "ooo_edit" };
  }
  // reminders: listing them, and marking one done
  if (/\breminders?\b/.test(t) && !/\b(?:set|add|create|make|new|remind me|cancel|delete|remove)\b/.test(t) && (/\?\s*$/.test(t) || /^(?:show|list|what|which|any|do i have|see)\b/.test(t))) return { intent: "list_reminders" };
  if (/^(?:(?:ok|okay|please|can you|could you)[,\s]+)*(?:mark|check off|tick off|complete)\b.*\b(?:reminder|reminders|one)\b.*\b(?:done|complete|completed|finished)\b|\b(?:reminder|the \d+\s?[ap]m one)\b.*\bis done\b/.test(t)) return { intent: "reminder_done" };
  // several contract dates in one message ("inspection Oct 29, appraisal Nov 6, financing Nov 13, settlement Nov 20 at 10"): one deal timeline, never one event
  if (!/\?\s*$/.test(t) && !/\b(post|caption|instagram|flyer)\b/.test(t) && [/\binspection\b/, /\bappraisal\b/, /\b(?:financing|loan commitment|mortgage commitment)\b/, /\b(?:settlement|closing(?! cost| credit)|close on)\b/, /\bearnest\b/, /\bwalk.?through\b/].filter((r) => r.test(t)).length >= 2 && /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d|\d{1,2}\/\d{1,2}|\b(?:mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)[a-z]*day\b/.test(t)) return { intent: "transaction" };
  // "Add Tomas Ferreira" / "Add a contact named Grant Abernathy-Wolfe" / "Add her as a seller": a person, not a task or a place
  if (!/\?\s*$/.test(t) && (/^(?:(?:[Pp]lease|[Pp]ls|[Oo]k|[Oo]kay|[Hh]ey|[Aa]nd|[Aa]lso|[Cc]an you|[Cc]ould you)[,\s]+)*[Aa]dd\s+(?:a\s+|another\s+)?(?:new\s+)?(?:contact|person)\s+(?:named\s+|called\s+)?\p{Lu}[\p{L}'’.-]+(?:\s+\p{Lu}[\p{L}'’.-]+){0,3}\b/u.test(raw.trim()) || /^(?:(?:[Pp]lease|[Pp]ls|[Oo]k|[Oo]kay|[Hh]ey|[Aa]nd|[Aa]lso)[,\s]+)*[Aa]dd\s+\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,3}\s*[.!]*$/u.test(raw.trim()) && !/\b(?:street|st|road|rd|avenue|ave|lane|ln|court|ct|drive|dr|way|boulevard|blvd)\b/i.test(raw) || /\badd\s+(?:her|him|them)\s+as\s+(?:a\s+|an\s+)?(?:buyer|seller|lead|renter|investor|client)\b/.test(t))) return { intent: "new_contact" };
  if (propertyFieldAsk(raw, !!parseAddress(raw)) || propertyListAsk(raw)) return { intent: "property_fact" }; // a question about a saved property's own numbers
  if (portalAsk(t)) return { intent: "portal_request" }; // asking Mila to scrape or pull from Zillow, Redfin, the MLS and the like: a clear no, free
  if (productTopic(t)) return { intent: "product_help" }; // questions about Mila itself (plans, credits, connections, support)

  if (/\b(?:listing (?:agreement|contract)|listing worksheet)\b/.test(t) && /\b(?:for|at|on|need|fill|draft|make|create|prepare|prep|write|start|do)\b/.test(t) && !/\b(uploaded|not uploaded)\b/.test(t) && !/^(?:please |can you |could you )?(?:email|e-mail|send|text|forward|draft an? (?:email|text))\b/.test(t) && !/^(?:what|when|who|where|how|did|is|are)\b/.test(t)) return { intent: "listing_agreement" };
  if (/\b(?:pet[- ]friendly|allow(?:s|ed)? (?:pets|dogs|cats)|(?:dogs?|cats?|pets?) (?:allowed|ok|okay|welcome))\b/.test(t) && /\b(?:my|saved|which|any|listings?|properties|homes?|rentals?)\b/.test(t)) return { intent: "pet_check" };

  const moveVerb = /\b(move|moved|moving|reschedule|rescheduled|push|pushed|change|changed|postpone|postponed|shift|shifted|switch|switched|bump|bumped|bumping|pushing)\b/;
  const past = /\bi\s+(?:just\s+)?(moved|rescheduled|changed|pushed|postponed|shifted|switched)\b|\bit(?:'s| is| has been)\s+(?:been\s+)?(moved|rescheduled|changed)\b|\b(?:got|has been|was)\s+(moved|rescheduled|changed)\b/.test(t);
  const eventNoun = /\b(open house|showing|tour|appointment|dentist|doctor|haircut|thing|\d{1,2}(?::\d\d)?\s?(?:am|pm)|presentation|meeting|call|lunch|dinner|coffee|closing|inspection|walkthrough|event|consult)/;
  const isQuestion = /^(what|when|who|where|how|do|did|is|are|can|could|should|why|which)\b|\?\s*$/.test(t) && !/^(can|could) (?:you|we) (?:please )?(?:move|reschedule|push|schedule|book|set|put|cancel|make|create|write|draft|add)\b/.test(t);
  // "going forward always cc my assistant": a standing instruction to remember (for this agent only)
  if (!isQuestion && /^\s*(?:going forward|from now on|from here on(?: out)?)\b/.test(t)) return { intent: "save_memory" };
  // "I usually do open houses on Saturdays" / "I never show on Sundays" is something to remember, not something to book
  if (/\bi(?:'ll| will)? (?:usually|always|normally|typically|generally|tend to|never|rarely)\b/.test(t) && !/\b(remind me|schedule|book|cancel|move|reschedule)\b/.test(t) && !isQuestion) return { intent: "save_memory" };
  if (/\bremind me\b|\bset (?:a )?reminder\b/.test(t)) return { intent: "reminder" };
  // "tell her I can't help" / "let Aisha know ..." / "yes draft that" is a message to write, not a search or a calendar change
  // "write Dana a follow-up after Thursday's 3pm showing, draft only": the thing to produce is words, not a calendar event, whatever day or time it mentions
  if (!isQuestion && /^(?:(?:please|pls|hey|ok|okay|can you|could you|just)[,\s]+)*(?:write|draft|compose)\b/.test(t) && /\b(?:follow.?up|e-?mail|note|message|text|reply|response|thank.?you)\b/.test(t) && !/\b(?:posts?|caption|carousel|instagram|story|flyer|description|script)\b/.test(t) && !/\b(?:everyone|everybody|all of them|each|who (?:came|attended|visited|signed)|attendees|visitors|sign.?in)\b/.test(t) && (!!parseDate(raw, new Date(), "UTC") || !!parseTime(raw) || /\b(?:draft only|just (?:a )?draft)\b/.test(t))) return { intent: "draft_email" };
  // "don't put it on my calendar" / "no need to schedule anything": a refusal, not a booking
  if (!isQuestion && /^(?:(?:please|pls|hey|ok|okay|actually|wait)[,\s]+)*(?:do ?n['’]?t|do not|never|no need to|stop)\s+(?:put|add|schedule|book|create|set up)\b/.test(t)) return { intent: "smalltalk", declared: true };
  // The agent REPORTING a conversation ("just got off the phone with Priya Shah, wants to tour Thursday", "spoke with a guy named Tom Whitaker") is history to log
  // (or a person to save), never a booking: "tour Thursday" inside it is what the client wants, not an appointment to make.
  if (!isQuestion && /^(?:(?:ok(?:ay)?|so|hey|fyi|mila|just|quick update)[,.\s]+)*(?:i\s+)?(?:just\s+)?(?:got off (?:the phone|a call|the line|my call|a zoom)|hung up|(?:spoke|talked|chatted)\s+(?:to|with)|met\s+with|met|ran into)\b/i.test(raw.trim()) && (/\bnamed\b/i.test(raw) || /(?:^|[^.!?]\s)\p{Lu}[\p{L}'’-]+\s+\p{Lu}[\p{L}'’-]+/u.test(raw.replace(/^\s*\S+\s*/, "")) || /\b(?:with|to|met|into)\s+\p{Lu}[\p{L}'’-]+/u.test(raw)) && !/\b(?:open house|showing at)\b/i.test(t.slice(0, 40))) return { intent: "new_contact" };
  // "I met a couple at the open house, Dave and Linda Kim, they want to sell" is a new person to save, not an open house to set up
  if (!isQuestion && /\bi (?:just )?(?:met|talked to|spoke (?:to|with)|ran into)\b/.test(t) && /\b(buy|sell|list|looking|interested|want(?:s|ed)? to|couple|family|client|lead)\b/.test(t)) return { intent: "new_contact" };
  // A message to a person ("text Maria the showing moved to 4", "tell her I'm late", "email Dana the packet") is a message to WRITE, even when it mentions moving or showing something
  if (!isQuestion && /^(?:(?:yah|yeah|yep|yes|ok|okay|sure|please|pls|plz|hey|can you|could you|go ahead|and|then)[,.!\s]+)*(?:(?:text|txt|sms|message|msg|email|e-mail)\s+(?!me\b|us\b|my\b|the\b|all\b|everyone\b|everybody\b|about\b)\S|(?:tell|notify|let)\s+(?!me\b|us\b|you\b)\S+(?:\s+know)?\s+\S)/.test(t)) return { intent: /^(?:\W*(?:yah|yeah|yep|yes|ok|okay|sure|please|pls|plz|hey|can you|could you|go ahead|and|then)\b[\s,.!]*)*(?:text|txt|sms|message|msg)\b/.test(t) ? "draft_text" : "draft_email" };
  if (!isQuestion && /^(?:(?:yah|yeah|yep|yes|ok|okay|sure|go ahead|and|then)[,.!\s]+)*(?:draft|write)\s+(?:that|it|one|a message|an email)\b/.test(t)) return { intent: "draft_email" };
  // "undo", "put it back", "go back to the original time"
  if (!isQuestion && t.split(/\s+/).length <= 8 && /^(?:(?:please|pls|plz|hey|ok|okay|actually|nvm|never ?mind|oops|wait|sorry)[,.!\s]+)*(?:undo(?:\s+(?:that|it|this|the (?:last|move|change)))?|revert(?:\s+(?:that|it))?|put it back|change it back|switch it back|move it back|go back(?: to (?:the )?(?:original|old|previous|earlier)(?: time| day)?)?|back to (?:the )?(?:original|old|previous)(?: time| day)?)[.!\s]*(?:please|pls)?[.!\s]*$/.test(t)) return { intent: "undo" };
  // two or more email addresses with a lead-in is a list of people to add
  if ((raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).length >= 2 && (/:/.test(raw) || /^\s*(?:please\s+)?(?:add|save|import)\b/i.test(raw)) && !/\b(draft|write|compose|send|follow.?up)\b/.test(t)) return { intent: "signin_paste" };
  // "what's on my calendar Friday", "do I have anything tomorrow", "am I free Friday at 3", "when is my next showing"
  // a bare "the one that happened today" is pointing at an event: show that day's calendar so the agent can say what they want
  if (/^(?:the |that )?one\b.{0,40}\b(today|yesterday|tonight|this morning|this afternoon|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(t) && !/\b(add|put|book|create|move|cancel|reschedule|remind|email|text|post)\b/.test(t)) return { intent: "agenda" };
  // "what time does it start on Sunday?" / "when does the open house begin": a question about the calendar, not a booking
  if (/^(?:and |so |ok |okay )?(?:what time|when)\b/.test(t) && /\b(start|starts|starting|begin|begins|beginning|kick(?:s)? off|is it|does it|is the|is my|are my|are the)\b/.test(t) && (/\b(open house|showing|appointment|meeting|call|lunch|closing|inspection|tour|it|that|one)\b/.test(t)) && !/\b(add|put|book|schedule (?:a|an)|create|move|cancel|reschedule|remind)\b/.test(t)) return { intent: "agenda" };
  if (/\b(calendar|schedule|agenda)\b/.test(t) && /\b(what|whats|what'?s|show|check|see|anything|tell|pull up|read|how'?s|how is|look)\b/.test(t) && !/\b(add|put|schedule (?:a|an)|book|set up|create|block)\b/.test(t.replace(/\b(my|the) schedule\b/, "")) && !/\b(post|email|flyer)\b/.test(t) && !/^(?:(?:please|pls|hey|ok|okay|can you|could you)[,\s]+)*(?:move|reschedule|push|postpone|bump|shift|cancel)\b/.test(t)) return { intent: "agenda" };
  if (/^(?:what|whats|what'?s)\s+(?:do i have|have i got|am i doing|is on|'?s on|on for|do i got)\b|^what'?s on\b|^do i have (?:anything|something|a thing|any)\b|^anything (?:on|for|booked)\b|^am i (?:free|busy|available|open)\b|^(?:are|is) (?:there )?(?:anything|something) (?:on|booked|scheduled)\b|^(?:when|what time) (?:is|are|'?s) my (?:next |first |last )?(?:showing|appointment|meeting|call|lunch|closing|inspection|open house|tour)/.test(t) && !/\b(plate|to do|follow|checklists?|tips?|scripts?|advice|a good|the best)\b/.test(t)) return { intent: "agenda" };

  // A client's search brief ("my clients want an apartment: legal weed, walkable at night, balcony, under $2,500...") is research for
  // the agent to act on, not a calendar item. It needs several requirements, a place or property word, and no street address.
  // "Add a retail space at 401 Congress Ave, Austin, TX 78701, 5,000 sq ft, for lease" / "Add a duplex at 12 Oak St" / "Add the Alamo, 300 Alamo Plaza, San Antonio, TX, for sale at $1.5M": a property to save
  if (!isQuestion && STREET.test(t) && /^\s*(?:please\s+)?(?:add|save|log|create|enter)\b/.test(t) && /\b(?:retail|office|warehouse|industrial|commercial|duplex|triplex|fourplex|multi[- ]?family|condo|townhome|townhouse|house|home|property|building|land|lot|space|listing|for sale|for lease|for rent)\b|\$\s?\d/.test(t) && !/\b(open house|showing|appointment|email|text|posts?|captions?|carousels?|remind|buyer|seller|renter|lead|client|contact|couple)\b/.test(t)) return { intent: "add_listing" };
  // "New buyer Dana Reyes, 512-555-0199, wants a rental under $2,000": a new person to save, even though what they want sounds like a search
  if (!isQuestion && /\b(?:new|got a|have a|met a|add)\b.{0,15}\b(?:buyer|seller|renter|tenant|investor|lead|client|prospect|couple)\b/.test(t) && /\b(?:buyer|seller|renter|tenant|investor|lead|client|prospect|couple)s?,?\s+(?:named\s+|called\s+|is\s+)?\p{Lu}[\p{L}'’-]+/u.test(raw) && !/\b(find|search|look up|recommend|shortlist|options for|pull|show me)\b/.test(t)) return { intent: "new_contact" };
  if (isClientSearch(raw) || isResearchTask(raw)) return { intent: "client_search" };
  // an actual date or time somewhere in the message (slang included: tmrw, Sat, the 15th, 1030am, half past 2)
  const hasWhen = !!parseDate(raw, new Date(), "UTC") || !!parseTime(raw);

  if (/\bsign.?in\b|\bvisitor list\b|\battendee/.test(t) && !/follow.?up|draft/.test(t)) return { intent: "signin_paste" };
  if (/\b(follow.?ups?|emails?|messages?|notes?)\b.*\b(for|to)\b.*\b(everyone|everybody|all of them|all (?:of )?(?:the )?(?:people|visitors|attendees)|each|who came|who attended|who visited|who signed)/.test(t) || /\b(everyone|everybody)\b.*\b(came|attended|visited|signed)/.test(t) || /follow.?ups?.*\b(open house|sign.?in)/.test(t) && /\b(draft|write|prepare|create)\b/.test(t) && !/\b(?:to|for)\s+\p{Lu}[\p{L}'’-]+/u.test(raw)) return { intent: "batch_followups" };

  // a client leaves, or the agent takes someone off their active list
  if (/\b(?:signed|sign(?:ing)?|went|gone|going|hired|hiring|using|chose|choosing|picked|working|work(?:ed)?|found|stuck)\b.{0,40}\b(?:another|a different|other|someone else|somebody else|their own|a new)\b.{0,20}\b(?:real\s?tors?|agents?|brokers?|brokerages?|someone|somebody|rep)\b|\bwent with (?:someone|somebody) else\b|\bnot working with me (?:anymore|any more)\b|\b(?:are|is) (?:working|signed) with (?:another|a different)\b/.test(t) && !/\b(?:draft|write|email|text)\b/.test(t) && !isQuestion) return { intent: "client_lost" };
  if (/^(?:please |pls |can you |could you )?(?:remove|take|drop|archive|mark|move|set|put)\b.{1,50}\b(?:from|off|as|to)\b.{0,12}\b(?:my )?(?:active|clients?|pipeline|leads?|follow-?ups?|list|inactive)\b/.test(t) && !/\b(?:calendar|schedule|showing|event|appointment)\b/.test(t) && !isQuestion) return { intent: "deactivate_contact" };
  if (/\bbefore (?:i|we) (?:leave|go|head out|take off|go away|get out|am out|'m out)\b|\bbefore i'?m (?:out|gone|away|off)\b|\bout[- ]of[- ]office (?:checklist|prep|plan)\b|\b(?:prep|prepare|get)\b.{0,20}\b(?:before|for)\b.{0,15}\b(?:my )?(?:time off|vacation|trip|being away|leaving)\b/.test(t)) return { intent: "pre_departure" };
  if (/\b(delete|remove|erase|wipe)\b/.test(t) && /\b(contacts?|clients?|leads?|buyers?|sellers?|people|everyone|everything|data|[a-z]+ [a-z]+)\b/.test(t) && !/\b(reminder|task|event|appointment|showing|open house|call|meeting|lunch|dinner|closing|inspection|tour|walkthrough|memory|draft|calendar|schedule)\b|\bo['’]?clock\b|\b\d{1,2}\s*(?:am|pm)\b/.test(t)) return { intent: "delete_data" };
  const notEventStuff = /\b(post|email|photo|flyer|caption|draft|sheet|reminder|task|memory|listing|contact)\b/;
  // "cancel the Oak open house and replace it with Pine Saturday 2-4": ONE swap (never two unrelated requests, and never half of one)
  if (!isQuestion && /\b(?:replace|swap|switch)\b[^.?!]{0,40}\b(?:with|for|to)\b|\binstead\b|\bin (?:its|their) place\b/.test(t) && /\b(?:cancel|scrap|scratch|drop|remove|replace|swap|switch)\b/.test(t) && eventNoun.test(t) && !/\b(?:email|text|post|draft|reminder|task)\b.{0,12}\b(?:replace|swap)\b/.test(t)) return { intent: "replace_event" };
  if (!isQuestion && /\b(cancel|scrap|nix|axe|kill|drop|call off|remove|delete|get rid of|take [a-z0-9' ]{0,30} off (?:my |the )?(?:calendar|schedule))\b/.test(t) && (eventNoun.test(t) || /\b(appointments?|everything|events?)\b/.test(t) || /\bo['’]?clock\b|\b\d{1,2}\s*(?:am|pm)\b|\b(?:from|off)\s+(?:my |the )?(?:calendar|schedule)\b/.test(t)) && !notEventStuff.test(t)) return { intent: "cancel_event" };
  if (!isQuestion && /^(?:(?:please|pls|plz|hey|ok|okay|actually|just|go ahead and)[,\s]+)*cancel\b.{2,60}\b(?:on|for)\s+(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}|\d{1,2}\/\d{1,2})\b/.test(t) && !notEventStuff.test(t)) return { intent: "cancel_event" };
  if (!isQuestion && /^(?:(?:please|pls|plz|hey|ok|okay|actually|just|go ahead and)[,\s]+)*cancel (?:it|that|this|the last one|the one)\b/.test(t)) return { intent: "cancel_event" };
  if (/^(?:(?:please|pls|plz|hey|ok|okay|actually|just|can you|could you|can we|let'?s)[,\s]+)*(?:move|reschedule|push|postpone|bump|shift|change|switch)\b/.test(t) && !notEventStuff.test(t) && (eventNoun.test(t) || (/\b(it|that|this)\b/.test(t) && (hasWhen || /\b(back|up|earlier|later|sooner)\b/.test(t) || t.split(/\s+/).length <= 3)))) return { intent: "move_event", declared: false };
  if (moveVerb.test(t) && eventNoun.test(t) && /\b(to|until|for|from)\b/.test(t)) return { intent: "move_event", declared: past };
  // "can we do the closing on the 20th instead" / "let's do the showing at 4 instead": the same appointment, somewhere else
  if (!isQuestion || /^(?:can|could) (?:we|you)\b/.test(t)) if (!/\b(?:replace|swap|cancel|scrap)\b/.test(t) && eventNoun.test(t) && /\b(?:instead|rather)\b/.test(t) && hasWhen && /\b(?:do|make|have|put|move|try)\b/.test(t)) return { intent: "move_event", declared: past };
  if (/\b(block(?:ing)? off (?:the |my )?(?:\d{1,2}(?:st|nd|rd|th)|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|tomorrow|today|next|this)|out of town|out of the office|out of office|on vacation|vacation|traveling|travelling|away|off work|day off|days off|taking (?:a |the |this |next )?(?:day|days|week|(?:mon|tues|wednes|thurs|fri|satur|sun)day) off|(?:mon|tues|wednes|thurs|fri|satur|sun)day off|i(?:'m| am) off (?:on )?(?:mon|tues|wednes|thurs|fri|satur|sun)day|unavailable|not working|i(?:'m| am) off|(?:^|\bi(?:'m| am|'ll be| will be)\s+|\bbe\s+|\btaking\s+)off\s+(?:on\s+|the\s+|next\s+|this\s+)?(?:\d{1,2}[\/-]\d{1,2}|\d{1,2}(?:st|nd|rd|th)|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|tomorrow|today))\b/.test(t) && !/\b(showing|open house|call|meeting|lunch|inspection|closing)\b/.test(t) && !/^(what|when|who|where|how|do|did|is|are|can|could|should|why)\b|\?\s*$/.test(t)) return { intent: "time_off" };
  // "block off all day Friday, I'm at the NAR conference": a whole working day held, not a one-hour appointment
  if (!/^(what|when|who|where|how|do|did|is|are|can|could|should|why)\b|\?\s*$/.test(t) && /\ball[- ]day\b/.test(t) && !!parseDate(raw, new Date(), "UTC") && !/\b(showing|open house|call|meeting|lunch|inspection|closing|remind)\b/.test(t)) return { intent: "time_off" };
  const isQ = /^(what|when|who|where|how|do|did|is|are|can|could|should|why)\b|\?\s*$/.test(t);
  if (!isQ && /\b(offer\b.{0,40}?\b(?:was |got |has been |is )?accepted|accepted (?:my|the|our|an) offer|under contract|went under contract|got (?:the )?contract|contract (?:is )?(?:ratified|signed|executed)|ratified)\b/.test(t) && !/\b(post|caption|instagram|email|flyer)\b/.test(t)) return { intent: "transaction" };
  // "what just listed in 20850?" / "condos listed in the last 3 days in Bethesda" / "what came on this week in Frederick"
  if (!STREET.test(t) && /\b(?:just listed|just hit|hit the market|came on(?: the market)?|newly listed|new on the market|listed (?:in|over|within) the (?:last|past)|(?:in|over|within) the (?:last|past) (?:\d+|few|couple) (?:day|week)s?)\b/.test(t) && /\b(?:in|near|around|for)\s+(?:[a-z]{3,}|\d{5})/.test(t) && !/\b(?:i|we)\s+(?:just\s+)?listed\b|\bmy listing\b/.test(t)) return { intent: "new_listings" };
  if (/\b(?:listings?|homes?|houses?|properties|condos?|town ?homes?|on the market)\b/.test(t) && /\b(?:new|newest|latest|fresh|recent|recently|just listed|just hit|hit the market|came on|coming on|just posted|posted)\b/.test(t) && /\b(?:in|near|around|nearby|my area|my market|area|market|today|this week|local)\b/.test(t) && (/^(?:(?:hey|hi|ok|okay|please|pls|mila)[,\s]+)*(?:what|which|show|find|pull|any|are there|got|list|give|see|check|search|look|send|text me|tell me)\b/.test(t) || /\bnew listings?\b|\bnew on the market\b|\bnewly listed\b|\bjust listed\b|\bjust hit\b/.test(t)) && !/\b(?:lead|buyer|seller|client|prospect|investor|renter|contact|named)\b|@|\d{3}[-. ]\d{3}[-. ]\d{4}/.test(t) && !/\b(?:my|our|your) listings?\b|\b(?:email|post|caption|instagram|flyer|announce|draft|story)\b|\b\d{1,6}\s+[a-z]+\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd)\b/.test(t)) return { intent: "new_listings" };
  // "Prep me for my 2 PM meeting with John" -> the person's file, history, properties, tasks (not a new meeting)
  if (/\b(?:prep(?:are)?|brief|get)\s+(?:me|us)\b/.test(t) && /\bwith\s+[a-z]/.test(t) && /\b(?:meeting|call|appointment|lunch|coffee|consult\w*|showing|chat|walkthrough|appt)\b/.test(t) && !STREET.test(t)) return { intent: "meeting_prep" };
  // "Follow up with everyone I showed 1231 Main Street to last week" -> the people from those showings, a personalized draft each
  if (/\bfollow.?ups?\b/.test(t) && /\b(?:everyone|everybody|anyone|all (?:of )?(?:the )?(?:people|buyers|clients|folks)|those (?:people|buyers))\b/.test(t) && /\b(?:showed|show|toured|saw|visited|viewed|walked)\b/.test(t)) return { intent: "showing_followups" };
  // "I'm listing 1231 Main Street next Thursday. Get me ready." -> save it, start the work, show what's known and what's open
  if ((/\b(?:i'?m|i am|we'?re|we are|i'?ll be|i will be|about to be|going to be)\s+listing\b/.test(t) || /\bget (?:me|us) ready\b/.test(t) || /\b(?:getting|gonna|going to) (?:be )?(?:ready )?(?:to )?list\b/.test(t)) && STREET.test(t) && !/\b(?:post|caption|instagram|email|flyer|draft|write)\b/.test(t)) return { intent: "listing_ready" };
  // "What am I missing?" / "am I ready?" / "what's left for 1231 Main?"
  if (/\bwhat(?:'s| is| am i| else am i| have i| do i)?\s*(?:still |possibly )?(?:missing|forgetting)\b|\bam i (?:ready|all set|forgetting|good to go)\b|\banything (?:i'?m|i am|am i) (?:missing|forgetting)\b|\bwhat (?:do i|else do i|am i) (?:still )?need\b/.test(t) || (/\bwhat(?:'s| is)\s+(?:left|still (?:needed|open|to do|outstanding))\b/.test(t) && /\b(?:listing|house|home|property|it|\d{1,6}\s+[a-z])\b/.test(t) && !/\b(?:calendar|today|tomorrow|week|schedule)\b/.test(t))) return { intent: "what_missing" };
  // "pull the tax history and last sale on 9 Maple Ct, Raleigh NC" / "what is 725 Park Ave Unit 4C worth"
  if (STREET.test(t) && /\b(?:tax(?:es)? history|tax record|property tax(?:es)?|last sale|sale history|sold for|ownership|who owns|assessed|worth|value of|home value|estimated value|comps? (?:for|on)|public record)\b/.test(t) && !/\b(?:closed on|we closed|just closed|open house|showing|post|email|caption|flyer|remind|price drop|reduced|now \$)/.test(t)) return { intent: "prep_property" };
  if (/\b(?:prep(?:are)?|brief me|research|look ?up|pull up|pull the info|info on|details on|details for|tell me about|what do you know about|what can you tell me about|run the numbers on|get me (?:the )?(?:info|details|data) (?:on|for)|get me info on)\b/.test(t) && /\b\d{1,6}\s+[a-z0-9'.]+(?:\s+[a-z0-9'.]+){0,3}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|boulevard|pl|place|ter|terrace|cir|circle|trl|trail|pkwy|parkway|hwy)\b/.test(t) && !/\b(post|caption|instagram|email|flyer|open house|showing|appointment|meeting|call)\b/.test(t.replace(/\bprep(?:are)?(?: me)? for (?:the |my |that |this |our |a )?(?:\d+(?::\d+)?\s?(?:am|pm)?\s)?(?:showing|open house|tour)\b/, ""))) return { intent: "prep_property" };
  if (!isQ && /\b(?:i |we )?(?:just )?closed on\b|\b(?:deal|sale) closed\b|\bwe closed\b|\bjust closed\b|\bsold (?:it|the (?:house|home|listing)|\d{1,6}\s+\w+)\b.*\bfor\b/.test(t) && !/\b(post|caption|instagram|email|flyer|draft|announce)/.test(t)) return { intent: "closed_deal" };
  if (!isQ && (/^log (?:a |the |my )?(?:call|text|email|meeting|conversation|chat)\b/.test(t) || /^(?:[A-Z][\p{L}'’-]+)(?: [A-Z][\p{L}'’-]+)?\s+(?:just\s+)?(?:called|texted|emailed|messaged|reached out|stopped by|came by|replied|responded|phoned)\b/u.test(raw.trim()) || /^(?:[Ii] )?(?:[Jj]ust )?(?:talked|spoke|met|got off the phone|got off a call|hung up)\s+(?:with|to)\s+[A-Z]/.test(raw.trim()) || /^(?:[Ii] )?(?:[Jj]ust )?(?:talked|spoke|got off the phone|got off a call)\s+(?:with|to)\s+[A-Z]/.test(raw.trim()) || /^[Jj]ust got off (?:the phone|a call) with\s+[A-Z]/.test(raw.trim()))) return { intent: "log_interaction" };
  if (!isQ && /^(?:(?:please|pls|hey|ok|okay|can you|could you)[,\s]+)*(?:text|txt|sms|send (?:a )?text(?: message)? to)\s+(?!me\b|my\b|the\b|all\b|everyone\b)[a-z]/.test(t)) return { intent: "draft_text" };
  if (/\b(?:how(?:'s| is| does)? (?:my |the )?(?:week|schedule|month|calendar)(?: look| looking| shaping)?|what(?:'s| is) (?:coming up|on deck|happening) (?:this|next) week|week ahead|my week|do i have (?:this|next) week|what do i have (?:this|next|going on)\b)/.test(t)) return { intent: "week_overview" };
  // "who has gone cold in my pipeline" is about people to contact, not about money
  if (/\b(?:who|which|any(?:one|body)?)\b.*\b(?:gone (?:cold|quiet|silent|dark)|going cold|gone stale|slipping|ghost\w*|gone dormant)\b/.test(t)) return { intent: "priorities" };
  if (/\b(pipeline|how much (?:am i|will i|could i|can i) (?:make|earn)|my gci|commission (?:forecast|estimate|pipeline)|what(?:'s| is) my (?:business|income|numbers)|how(?:'s| is) (?:my )?business)\b/.test(t) || /\b(?:commission|comp)(?: rate)?\s*(?:is|=|of|at|:)\s*\d(?:\.\d+)?\s*%/.test(t)) return { intent: "pipeline_value" };
  if (!/\bmatch\b.*\b(?:buyers?|leads?|clients?|contacts?)\b/.test(t) && !/\b(?:new|hot|warm|zillow|referral|website|online)\s+(?:buyer |seller )?(?:leads?|prospects?|clients?)\b|\b(?:got|have|received)\s+(?:a |an )?(?:new )?(?:leads?|prospects?)\b/.test(t) && !/^(?:what|when|who|where|how|do|did|is|are|can|could|should|why)\b|\?\s*$/.test(t) && /\b(new listing|(?:new|nw) l[a-z]{3,6}n?g|got a listing|got the listing|got a new listing|just listed|just signed|i (?:just )?(?:got|signed|landed|listed|took)|add (?:a |my |the )?(?:new )?listing|add (?:a |my |the )?(?:new )?(?:property|home|house)|listing (?:at|on)|my listing)\b/.test(t) && /\b\d{1,6}\s+[a-z]|\b(listing|listed)\b/.test(t) && !/\b(open house|showing|email|post|carousel|instagram|story|caption|flyer|remind|appointment|presentation|consult\w*|meeting|walkthrough)/.test(t.replace(/\b(listing|listed) (?:at|on)\b/, "")) ) return { intent: "add_listing" };
  // "that one is commercial" / "it's a duplex" / "mark it as land": tell Mila what kind of property it is
  if (!isQuestion && /\b(?:(?:(?:that|this|the)(?: [\\p{L}'-]+){0,2}(?: one| place| property| listing| house| home)?|it)(?:'s| is| was| has)|(?:mark|set|make|change|call)\b.{0,25}?\b(?:as|to|a|an))\s+(?:actually\s+)?(?:a |an |the )?(?:commercial|office|retail|warehouse|industrial|mixed[- ]use|land|vacant (?:lot|land)|duplex|triplex|fourplex|multi[- ]?family|apartment building|condo|town ?home|town ?house|single[- ]family)\b/.test(t) && !/\b(post|caption|email|text|draft|instagram|open house|showing|remind)\b/.test(t)) return { intent: "update_listing" };
  // "price is now 450k" / "make it 4 bed 3 bath": a change to a listing's facts (which listing is decided from the conversation, or asked)
  if (!isQuestion && !STREET.test(t) && (/^\s*(?:the\s+)?(?:list(?:ing)?\s+|asking\s+)?price\s+(?:is|=|now|just)\s*(?:now\s+|actually\s+)?\$?\d/.test(t) || /^\s*make\s+it\s+\d+(?:\.\d)?\s*(?:bed|br|bd|bath|ba)\b/.test(t))) return { intent: "update_listing" };
  // "Actually that one has 4 bedrooms" / "it's 3 bed 2 bath": a correction to the listing we were just talking about
  if (!isQuestion && !STREET.test(t) && (/\b(?:that|this|the)(?: [\p{L}'-]+){0,2} (?:one|listing|house|home|property|place)\b.{0,20}\b(?:has|is|actually|now)\b/u.test(t) || /^\s*(?:actually|correction|sorry|oops)[, ]*\s*(?:it|that)(?:'s|s| is| has)\b/.test(t)) && /\b\d[\d,]*\s*(?:bed(?:room)?s?|bd|br|bath(?:room)?s?|ba|sq\s?ft|sqft|square feet)\b/.test(t)) return { intent: "update_listing" };
  // "price drop on 12 Oak St, now $425k" / "reduced the Oak St listing to 399" / "12 Oak St is actually 4 bed 3 bath"
  if (!isQuestion && !/\b(email|post|caption|carousel|flyer|text|message|remind|draft|write|instagram|story|open house|showing|sheet)\b/.test(t)
    && ((/\b(price (?:drop|cut|change|reduction|reduced|update)|reduced|reduce|cut|lower(?:ed)?|raise[d]?|drop(?:ped)?|change(?:d)?|update(?:d)?|new price|now (?:asking|listed|priced|at)|asking (?:is )?now|bump(?:ed)?)\b/.test(t) && /\b(price|asking|listing|reduced|reduce|cut)\b/.test(t) && /\$\s?\d|\b\d[\d,.]*\s?[km]\b|\b(?:to|now|at)\s+\$?\d{3}\b|\b\d{1,3},\d{3}\b/.test(t))
      || (/\b\d{1,6}\s+[a-z0-9.' ]{2,30}?\s(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|pl|place|cir|circle|terr|terrace)\b.{0,15}\b(?:is|has|actually|now)\b.{0,25}\b\d[\d,]*\s*(?:bed|bd|br|bath|ba|sq|sf)/.test(t)))) return { intent: "update_listing" };
  if (/\blisting\b/.test(t) && /\$\s?\d|\b\d+\s?(?:bed|br|bd)\b|\b\d{1,6}\s+[a-z]+\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|pl|place|cir|circle)\b/.test(t) && !/\b(open house|showing|email|posts?|carousels?|instagram|stor(?:y|ies)|captions?|flyers?|remind|appointment|presentation|consult\w*|meeting|walkthrough|walk-through)\b/.test(t)) return { intent: "add_listing" };
  if (/\b(email|e-mail|message|send)\b/.test(t) && /\b(contacts|buyers|leads|clients|everyone|my list|audience)\b/.test(t) && /\b(open house|listing|just listed|showing)\b/.test(t)) return { intent: "email_audience" };
  // an address plus "open house" and a post word (or no date at all) is a post for that property, not a person to message and not a booking
  if (STREET.test(t) && /open\s*house/.test(t) && !isQuestion && !/\b(email|e-mail|text|sms|message|tell|invite)\b/.test(t) && (/\b(posts?|caption|carousel|instagram|insta|ig|story|stories|graphic|flyer|content|promo|promote|announce|announcement)\b/.test(t) || (!hasWhen && !/\b(?:set up|setup|schedule|plan|host|hold|book|relaunch)\b/.test(t)))) return { intent: "social_post" };
  // natural phrasings that used to fall through to the menu
  if (/^(?:dentist|doctor|dr\.?|haircut|gym|workout|massage|vet|therapy|physio|pickup|errand)\b/.test(t) && hasWhen && !isQuestion) return { intent: "create_event" };
  if (/^(?:and |so |ok |okay )?(?:what'?s|whats|what is) next\b|\banything (?:this|on the|for the) (?:weekend|week)\b|\bwhat'?s (?:going on|happening) (?:this|next) (?:weekend|week)\b/.test(t)) return { intent: "agenda" };
  if (/\bwhat should i (?:focus on|work on|tackle|do first)\b|\bi'?m (?:so )?(?:overwhelmed|swamped|buried|stressed|drowning)\b|\bwhere (?:do|should) i start\b/.test(t)) return { intent: "priorities" };
  if (/\b(?:is|are)\s+.{3,40}\s+ready (?:to list|for (?:market|the market|listing))\b/.test(t)) return { intent: "listing_ready" };
  if (/\bany (?:new )?(?:listings|homes|matches)\b.{0,25}\b(?:buyers?|clients?)\b/.test(t)) return { intent: "new_listings" };
  if (/\bwhat'?s (?:coming up|next|left|due|happening) (?:on|with|for) (?:my|the) (?:closing|transaction|deal|contract)\b/.test(t)) return { intent: "transaction" };
  if (/\bwhat did i (?:last )?(?:say|tell|send|write|text|email) (?:to )?[a-z]+/.test(t)) return { intent: "recall" };
  if (/^(?:and |oh )?(?:oh |and )?(?:also )?cancel (?:my |the )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/.test(t)) return { intent: "cancel_event" };
  if (/^(?:follow up|follow-up|reach out|check in) with (?:everyone|all|the people|anyone|folks)\b.*\bopen house\b/.test(t)) return { intent: "email_audience" };
  if (/\b(?:just|finally)\s+(?:wrapped|finished|got done|got back|ended)\b.{0,25}open\s*house|\bhow did (?:my|the) open\s*house go\b|\bwho (?:came|showed up|attended) (?:to|at) (?:my|the) open\s*house\b/.test(t)) return { intent: "oh_recap" };
  // "my open house went good today": a report on something that already happened, never a booking
  if (/open\s*house/.test(t) && /\b(went|was|were|turned out|had|hosted|did|finished|wrapped|ended|is over|are over|done)\b/.test(t) && /\b(good|great|go\b|up||well|awesome|amazing|fine|busy|slow|quiet|packed|rough|bad|terrible|crazy|fun|today|yesterday|last night|this morning|this afternoon)\b/.test(t) && !/\b(will|going to|gonna|plan|planning|schedule|book|set up|setup|next|tomorrow|upcoming)\b/.test(t) && !/\b(post|instagram|caption|carousel|flyer)\b/.test(t)) return { intent: "oh_recap" };
  if (/open house/.test(t) && (/\b(have|hosting|host|holding|set up|setup|plan|planning|prepare|schedule|organize|scheduled|this|next|on|at)\b/.test(t) || hasWhen) && !/instagram|facebook|post|carousel|tiktok/.test(t) && !isQuestion) return { intent: "open_house" };
  if (/\b(make|create|write|draft|design|generate|do|need|build|want|give)\b.{0,25}\b(an? |\d+ |one |two |three |four |five |some )?(social )?(posts?|captions?|carousels?|story|stories)\b/.test(t) && !/\b(email|open house at)\b/.test(t)) return { intent: "social_post" };
  // "a post for 12 Oak Lane" / "ig caption about the open house": a fragment, but unmistakably a content request
  if (!isQuestion && /^\s*(?:(?:an?|one|\d+|the|my)\s+)?(?:instagram\s+|ig\s+|social\s+)?(?:posts?|captions?|carousels?)\s+(?:for|about|on)\b/.test(t) && !/\b(email|e-mail)\b/.test(t)) return { intent: "social_post" };
  if (!isQuestion && /\b(\d+|one|two|three|four|five|six)\s+(?:instagram\s+|social\s+)?(posts|captions|carousels|stories)\b/.test(t) && !/\b(email|open house at|listings?\s+(?:in|for))\b/.test(t)) return { intent: "social_post" };
  if (/\b(just listed|price (?:improvement|drop|reduction|change)|new price|coming soon|just sold)\b.{0,12}\b(posts?|captions?|carousels?|story|stories)\b/.test(t)) return { intent: "social_post" };
  if (/\bshowing sheets?\b|\bwalk-?through (?:sheet|checklist)\b|\btouring (?:sheet|checklist)\b/.test(t) && !/\b(email|remind|cancel|delete)\b/.test(t)) return { intent: "showing_sheet" };
  if (!isQuestion && /^(?:(?:please|pls|plz|hey|ok|okay|can you|could you)[,\s]+)*(?:email|e-mail|text|message|msg)\s+(?!me\b|my\b|the\b|all\b|everyone\b|everybody\b|about\b)[a-z]/.test(t)) return { intent: "draft_email" };
  if (/(instagram|facebook|tiktok|linkedin|twitter|\bx post\b|social)\b/.test(t) && /(post|carousel|caption|reel|content|story)/.test(t)) return { intent: "social_post" };
  if (/\b(schedule|book|set up|add|put|create)\b/.test(t) && (eventNoun.test(t) || (hasWhen && /\b(something|an? (?:event|appointment|thing)|stuff|time)\b/.test(t))) && !/\b(post|email|caption|listing|reminder|sheet)\b/.test(t)) return { intent: "create_event" };
  // "lunch with Mark" with no day yet: it is still a calendar request, and the day comes next
  if (!isQuestion && /^\s*(?:(?:set up|schedule|book|put|add)\s+(?:a |an |the |my )?)?(?:lunch|dinner|coffee|breakfast|meeting|call|appointment|showing|tour|inspection)\s+(?:with|for)\s+\S+\s*[.!]*$/.test(t) && !/\b(draft|write|email|text|message|remind|send|follow|cancel|move|reschedule)\b/.test(t)) return { intent: "create_event" };
  // "I'll be at the dentist Friday 10-11": the agent's own time, on the calendar
  if (!isQuestion && /^\s*(?:i(?:'ll| will)? be|i'm|i am)\s+(?:at|in|with)\s+\S+/.test(t) && hasWhen && !/\b(open house|showing|listing|reminder|remind)\b/.test(t) && !/\b(out of town|out of the office|out of office|away|on vacation|off)\b/.test(t)) return { intent: "create_event" };
  // a bare statement like "Showing tomorrow at 3" or "Lunch with John Friday 1pm" means "put it on my calendar"
  if (/\b(showing|appointment|meeting|lunch|dinner|coffee|breakfast|closing|inspection|consult|tour|walkthrough|call)\b/.test(t) && hasWhen && !isQuestion && !/\b(draft|write|email|text|message|remind|send|follow|reminder)\b/.test(t)) return { intent: "create_event" };
  if (!isQuestion && !/^(?:what|who|which|how|why|when|where|is|are|do|does|can|could|should)\b/.test(t) && /\b(new|got a|have a|met a|meeting a|signed|add)\b.*\b(buyer|seller|renter|tenant|investor|lead|client|prospect)\b/.test(t) || /\badd\b.+\bas (a |an )?(buyer|seller|lead|renter|investor|client)s?\b/.test(t)) return { intent: "new_contact" };
  if (/\b(haven'?t|have not|hasn'?t)( i| we| you)? (talked|spoken|heard|reached|contacted|followed|checked)|gone (quiet|cold|silent)|\bwho.*\b(ghost|stale|cold|slipp|forgot)|long (time|while) since\b/.test(t)) return { intent: "priorities" };
  if (/\bwho\b.*\b(follow|reach out|contact|call|text|email|check in)\b|\b(follow.?ups?|to.?do|on my plate|need(?:s)? my attention|priorit)\b.*\b(today|now|first|this week)\b|\bwhat should i (?:do|work on)\b|\bwhat do i need to (?:do|get done)\b|\bwhat'?s (?:on|next)\b.*\b(today|plate)\b|^who do i need/.test(t)) return { intent: "priorities" };
  if (/\b(debrief|brief me|catch me up|summary of my day|daily summary|morning brief|my day)\b/.test(t)) return { intent: "debrief" };
  // advice about handling a situation ("how should I respond when sellers want to list over market") goes to the expert chat, not a live market lookup
  if (/^(?:how (?:should|do|can|would|could) i|what should i|should i|can i|help me|walk me|what do i say)\b/.test(t) && !/\b(today|right now|currently|this week|this month|trend|trending|rates?|median|inventory|days on market|prices? (?:in|for|of))\b/.test(t)) return { intent: "general" };
  if (/\b(market|inventory|home prices?|home values?|days on market|median|mortgage rates?|interest rates?|housing)\b|what'?s happening in|what are buyers seeing|trends? in\b/.test(t)) return { intent: "market" };
  if (/\b(find|show|search|get|list)\b.*\b(something|homes?|houses?|listings?|properties|condos?|townhomes?)\b.*\bfor\b|\bfind something for\b/.test(t)) return { intent: "find_property" };
  // "who in my database is looking for a 3 bed townhome?" / "match my new listing to my buyers"
  // "Which of my buyers match 401 E Jefferson St?" / "Anyone looking for homes under $400k in Charlotte?" / "do I have any buyers under 500k" is a search of HER contacts
  if (/^(?:which|what|who)\b.*\b(?:of )?my\b.*\b(?:buyers?|leads?|clients?|contacts?)\b.*\b(?:match|fit|want|looking|interested|could|would)\b/.test(t) || /^(?:anyone|anybody|any of my (?:buyers?|leads?|clients?)|do i have (?:any|anyone))\b.*\b(?:looking|wants?|interested|searching|shopping|buyers?|needs?)\b/.test(t)) return { intent: "find_contacts" };
  if (/^who\b.*\b(?:in )?my\b.*\b(?:database|contacts?|leads?|buyers?|clients?|list|pipeline|crm|sphere)\b/.test(t) || /\bmatch\b.*\b(?:listing|home|property|house)\b.*\b(?:to|with)\b.*\b(?:buyers?|leads?|clients?|contacts?)\b/.test(t)) return { intent: "find_contacts" };
  if (/\b(find|show|list|search|who are)\b.*\b(contacts?|buyers|sellers|leads|investors|renters|clients|people)\b|^(show|list) (me )?(my )?(buyers|sellers|leads|contacts)/.test(t)) return { intent: "find_contacts" };
  if (/\b(?:what'?s|what is|whats|give me|gimme|get me|need|find|pull up|look up|do you have|got)\b.{0,30}\b(?:number|phone|cell|mobile|email|e-mail)\b|\b[a-z][a-z'’-]+['’]s\s+(?:email|e-mail|phone|number|cell|mobile)\b/.test(t) && !/\b(draft|write|compose|send|remind)\b/.test(t)) return { intent: "recall" };
  if (/^(who is|who's|whos|who are|tell me about|what about|info on|look up|lookup|pull up|show me)\b/.test(t) && !/\b(market|my day|my schedule)\b/.test(t)) return { intent: "recall" };
  if (/\b(what do you (?:know|remember) about|tell me about|what('?s| is) .*(preferences?|looking for)|what does .* (want|like))\b/.test(t) && /\b[a-z]+\b/.test(t) && /(about|does|preferences)/.test(t)) return { intent: "recall" };
  if (!isQuestion && /\bremember that\b|(?:^|\s)remember\s*[:,-]|\bnote that\b|\bkeep in mind\b/.test(t)) return { intent: "save_memory" };
  if (/\b(draft|write|compose|send|prepare)\b.*\b(email|message|note|follow.?up|text)\b/.test(t) || /\bemail\b.+\b(about|regarding)\b/.test(t)) return { intent: "draft_email" };
  if (/https?:\/\/\S+/i.test(raw)) return { intent: "listing_link" };
  if (hasAttachments) return { intent: "signin_paste" };
  if (/^[^\n]+(,|\t)[^\n]*@[^\n]+/m.test(raw) && raw.split("\n").length >= 2) return { intent: "signin_paste" };
  if (/\b(import|upload|paste|pasting|add|save)\b.{0,30}\b(contacts?|leads?|people|list|clients?)\b/.test(t.split("\n")[0]) && raw.split("\n").filter((l) => /@/.test(l)).length >= 2) return { intent: "signin_paste" };
  return { intent: "general" };
}
