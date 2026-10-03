import { parseDate, parseTime } from "./nlu";

export type Intent =
  | "add_listing" | "time_off" | "open_house" | "move_event" | "cancel_event" | "create_event" | "reminder" | "new_contact" | "priorities" | "market"
  | "debrief" | "find_contacts" | "signin_paste" | "batch_followups" | "social_post" | "draft_email" | "email_audience" | "recall" | "save_memory"
  | "find_property" | "delete_data" | "listing_link" | "showing_sheet" | "agenda" | "update_listing" | "undo" | "smalltalk" | "general";

export const INTENTS: Intent[] = ["add_listing", "time_off", "open_house", "move_event", "cancel_event", "create_event", "reminder", "new_contact", "priorities", "market", "debrief", "find_contacts", "signin_paste", "batch_followups", "social_post", "draft_email", "email_audience", "recall", "save_memory", "find_property", "delete_data", "listing_link", "showing_sheet", "agenda", "update_listing", "undo", "smalltalk", "general"];

export interface Detected { intent: Intent; declared?: boolean }

/** Rule-based router: free, instant, handles the common real-estate requests. */
export function detectIntent(raw: string, hasAttachments = false): Detected {
  const t = raw.toLowerCase().trim();
  if (!t && hasAttachments) return { intent: "signin_paste" };
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening)|thanks|thank you|thx|ok|okay|cool|great|got it)[\s!.,]*(mila)?[\s!.]*$/.test(t)) return { intent: "smalltalk" };

  const moveVerb = /\b(move|moved|moving|reschedule|rescheduled|push|pushed|change|changed|postpone|postponed|shift|shifted|switch|switched|bump|bumped|bumping|pushing)\b/;
  const past = /\bi\s+(?:just\s+)?(moved|rescheduled|changed|pushed|postponed|shifted|switched)\b|\bit(?:'s| is| has been)\s+(?:been\s+)?(moved|rescheduled|changed)\b|\b(?:got|has been|was)\s+(moved|rescheduled|changed)\b/.test(t);
  const eventNoun = /\b(open house|showing|tour|appointment|meeting|call|lunch|dinner|coffee|closing|inspection|walkthrough|event|consult)/;
  const isQuestion = /^(what|when|who|where|how|do|did|is|are|can|could|should|why|which)\b|\?\s*$/.test(t) && !/^(can|could) (?:you|we) (?:please )?(?:move|reschedule|push|schedule|book|set|put|cancel|make|create|write|draft|add)\b/.test(t);
  // "I usually do open houses on Saturdays" / "I never show on Sundays" is something to remember, not something to book
  if (/\bi(?:'ll| will)? (?:usually|always|normally|typically|generally|tend to|never|rarely)\b/.test(t) && !/\b(remind me|schedule|book|cancel|move|reschedule)\b/.test(t) && !isQuestion) return { intent: "save_memory" };
  if (/\bremind me\b|\bset (?:a )?reminder\b/.test(t)) return { intent: "reminder" };
  // "undo", "put it back", "go back to the original time"
  if (!isQuestion && t.split(/\s+/).length <= 8 && /^(?:(?:please|pls|plz|hey|ok|okay|actually|nvm|never ?mind|oops|wait|sorry)[,.!\s]+)*(?:undo(?:\s+(?:that|it|this|the (?:last|move|change)))?|revert(?:\s+(?:that|it))?|put it back|change it back|switch it back|move it back|go back(?: to (?:the )?(?:original|old|previous|earlier)(?: time| day)?)?|back to (?:the )?(?:original|old|previous)(?: time| day)?)[.!\s]*(?:please|pls)?[.!\s]*$/.test(t)) return { intent: "undo" };
  // two or more email addresses with a lead-in is a list of people to add
  if ((raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).length >= 2 && /:/.test(raw) && !/\b(draft|write|compose|send|follow.?up)\b/.test(t)) return { intent: "signin_paste" };
  // "what's on my calendar Friday", "do I have anything tomorrow", "am I free Friday at 3", "when is my next showing"
  if (/\b(calendar|schedule|agenda)\b/.test(t) && /\b(what|whats|what'?s|show|check|see|anything|tell|pull up|read|how'?s|how is|look)\b/.test(t) && !/\b(add|put|schedule (?:a|an)|book|set up|create|block)\b/.test(t.replace(/\b(my|the) schedule\b/, "")) && !/\b(post|email|flyer)\b/.test(t)) return { intent: "agenda" };
  if (/^(?:what|whats|what'?s)\s+(?:do i have|have i got|am i doing|is on|'?s on|on for|do i got)\b|^what'?s on\b|^do i have (?:anything|something|a thing|any)\b|^anything (?:on|for|booked)\b|^am i (?:free|busy|available|open)\b|^(?:are|is) (?:there )?(?:anything|something) (?:on|booked|scheduled)\b|^(?:when|what time) (?:is|are|'?s) my (?:next |first |last )?(?:showing|appointment|meeting|call|lunch|closing|inspection|open house|tour)/.test(t) && !/\b(plate|to do|follow)/.test(t)) return { intent: "agenda" };
  // an actual date or time somewhere in the message (slang included: tmrw, Sat, the 15th, 1030am, half past 2)
  const hasWhen = !!parseDate(raw, new Date(), "UTC") || !!parseTime(raw);

  if (/\bsign.?in\b|\bvisitor list\b|\battendee/.test(t) && !/follow.?up|draft/.test(t)) return { intent: "signin_paste" };
  if (/\b(follow.?ups?|emails?|messages?|notes?)\b.*\b(for|to)\b.*\b(everyone|everybody|all of them|all (?:of )?(?:the )?(?:people|visitors|attendees)|each|who came|who attended|who visited|who signed)/.test(t) || /\b(everyone|everybody)\b.*\b(came|attended|visited|signed)/.test(t) || /follow.?ups?.*\b(open house|sign.?in)/.test(t) && /\b(draft|write|prepare|create)\b/.test(t)) return { intent: "batch_followups" };

  if (/\b(delete|remove|erase|wipe)\b/.test(t) && /\b(contacts?|clients?|leads?|buyers?|sellers?|people|everyone|everything|data|[a-z]+ [a-z]+)\b/.test(t) && !/\b(reminder|task|event|appointment|showing|open house|call|meeting|lunch|dinner|closing|inspection|tour|walkthrough|memory|draft)\b/.test(t)) return { intent: "delete_data" };
  const notEventStuff = /\b(post|email|photo|flyer|caption|draft|sheet|reminder|task|memory|listing|contact)\b/;
  if (!isQuestion && /\b(cancel|scrap|nix|axe|kill|drop|call off|remove|delete|get rid of|take [a-z0-9' ]{0,30} off (?:my |the )?(?:calendar|schedule))\b/.test(t) && (eventNoun.test(t) || /\b(appointments?|everything|events?)\b/.test(t)) && !notEventStuff.test(t)) return { intent: "cancel_event" };
  if (!isQuestion && /^(?:(?:please|pls|plz|hey|ok|okay|actually|just|go ahead and)[,\s]+)*cancel (?:it|that|this|the last one|the one)\b/.test(t)) return { intent: "cancel_event" };
  if (/^(?:(?:please|pls|plz|hey|ok|okay|actually|just|can you|could you|can we|let'?s)[,\s]+)*(?:move|reschedule|push|postpone|bump|shift|change|switch)\b/.test(t) && !notEventStuff.test(t) && (eventNoun.test(t) || (/\b(it|that|this)\b/.test(t) && (hasWhen || /\b(back|up|earlier|later|sooner)\b/.test(t) || t.split(/\s+/).length <= 3)))) return { intent: "move_event", declared: false };
  if (moveVerb.test(t) && eventNoun.test(t) && /\b(to|until|for|from)\b/.test(t)) return { intent: "move_event", declared: past };
  if (/\b(out of town|out of the office|out of office|on vacation|vacation|traveling|travelling|away|off work|day off|days off|taking (?:a |the |this |next )?(?:day|days|week|(?:mon|tues|wednes|thurs|fri|satur|sun)day) off|(?:mon|tues|wednes|thurs|fri|satur|sun)day off|i(?:'m| am) off (?:on )?(?:mon|tues|wednes|thurs|fri|satur|sun)day|unavailable|not working|i(?:'m| am) off|(?:^|\bi(?:'m| am|'ll be| will be)\s+|\bbe\s+|\btaking\s+)off\s+(?:on\s+|the\s+|next\s+|this\s+)?(?:\d{1,2}[\/-]\d{1,2}|\d{1,2}(?:st|nd|rd|th)|(?:mon|tue|wed|thu|fri|sat|sun)|tomorrow|today))\b/.test(t) && !/\b(showing|open house|call|meeting|lunch|inspection|closing)\b/.test(t) && !/^(what|when|who|where|how|do|did|is|are|can|could|should|why)\b|\?\s*$/.test(t)) return { intent: "time_off" };
  if (/\b(new listing|(?:new|nw) l[a-z]{3,6}n?g|got a listing|got the listing|got a new listing|just listed|just signed|i (?:just )?(?:got|signed|landed|listed|took)|add (?:a |my |the )?(?:new )?listing|add (?:a |my |the )?(?:new )?(?:property|home|house)|listing (?:at|on)|my listing)\b/.test(t) && /\b\d{1,6}\s+[a-z]|\b(listing|listed)\b/.test(t) && !/\b(open house|showing|email|post|carousel|instagram|story|caption|flyer|remind)/.test(t.replace(/\b(listing|listed) (?:at|on)\b/, "")) ) return { intent: "add_listing" };
  // "price drop on 12 Oak St, now $425k" / "reduced the Oak St listing to 399" / "12 Oak St is actually 4 bed 3 bath"
  if (!isQuestion && !/\b(email|post|caption|carousel|flyer|text|message|remind|draft|write|instagram|story|open house|showing|sheet)\b/.test(t)
    && ((/\b(price (?:drop|cut|change|reduction|reduced|update)|reduced|reduce|cut|lower(?:ed)?|raise[d]?|drop(?:ped)?|change(?:d)?|update(?:d)?|new price|now (?:asking|listed|priced|at)|asking (?:is )?now|bump(?:ed)?)\b/.test(t) && /\b(price|asking|listing|reduced|reduce|cut)\b/.test(t) && /\$\s?\d|\b\d[\d,.]*\s?[km]\b|\b(?:to|now|at)\s+\$?\d{3}\b|\b\d{1,3},\d{3}\b/.test(t))
      || (/\b\d{1,6}\s+[a-z0-9.' ]{2,30}?\s(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|pl|place|cir|circle|terr|terrace)\b.{0,15}\b(?:is|has|actually|now)\b.{0,25}\b\d[\d,]*\s*(?:bed|bd|br|bath|ba|sq|sf)/.test(t)))) return { intent: "update_listing" };
  if (/\blisting\b/.test(t) && /\$\s?\d|\b\d+\s?(?:bed|br|bd)\b|\b\d{1,6}\s+[a-z]+\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|pl|place|cir|circle)\b/.test(t) && !/\b(open house|showing|email|post|carousel|instagram|story|caption|flyer|remind)\b/.test(t)) return { intent: "add_listing" };
  if (/\b(email|e-mail|message|send)\b/.test(t) && /\b(contacts|buyers|leads|clients|everyone|my list|audience)\b/.test(t) && /\b(open house|listing|just listed|showing)\b/.test(t)) return { intent: "email_audience" };
  if (/open house/.test(t) && (/\b(have|hosting|host|holding|set up|setup|plan|planning|prepare|schedule|organize|scheduled|this|next|on|at)\b/.test(t) || hasWhen) && !/instagram|facebook|post|carousel|tiktok/.test(t) && !isQuestion) return { intent: "open_house" };
  if (/\b(make|create|write|draft|design|generate|do|need|build|want|give)\b.{0,25}\b(an? |\d+ |one |two |three |four |five |some )?(social )?(posts?|captions?|carousels?|story|stories)\b/.test(t) && !/\b(email|open house at)\b/.test(t)) return { intent: "social_post" };
  if (!isQuestion && /\b(\d+|one|two|three|four|five|six)\s+(?:instagram\s+|social\s+)?(posts|captions|carousels|stories)\b/.test(t) && !/\b(email|open house at|listings?\s+(?:in|for))\b/.test(t)) return { intent: "social_post" };
  if (/\b(just listed|price (?:improvement|drop|reduction|change)|new price|coming soon|just sold)\b.{0,12}\b(posts?|captions?|carousels?|story|stories)\b/.test(t)) return { intent: "social_post" };
  if (/\bshowing sheets?\b|\bwalk-?through (?:sheet|checklist)\b|\btouring (?:sheet|checklist)\b/.test(t) && !/\b(email|remind|cancel|delete)\b/.test(t)) return { intent: "showing_sheet" };
  if (!isQuestion && /^(?:(?:please|pls|plz|hey|ok|okay|can you|could you)[,\s]+)*(?:email|e-mail|text|message|msg)\s+(?!me\b|my\b|the\b|all\b|everyone\b|everybody\b|about\b)[a-z]/.test(t)) return { intent: "draft_email" };
  if (/(instagram|facebook|tiktok|linkedin|twitter|\bx post\b|social)\b/.test(t) && /(post|carousel|caption|reel|content|story)/.test(t)) return { intent: "social_post" };
  if (/\b(schedule|book|set up|add|put|create)\b/.test(t) && (eventNoun.test(t) || (hasWhen && /\b(something|an? (?:event|appointment|thing)|stuff|time)\b/.test(t))) && !/\b(post|email|caption|listing|reminder|sheet)\b/.test(t)) return { intent: "create_event" };
  // a bare statement like "Showing tomorrow at 3" or "Lunch with John Friday 1pm" means "put it on my calendar"
  if (/\b(showing|appointment|meeting|lunch|dinner|coffee|breakfast|closing|inspection|consult|tour|walkthrough|call)\b/.test(t) && hasWhen && !isQuestion && !/\b(draft|write|email|text|message|remind|send|follow|reminder)\b/.test(t)) return { intent: "create_event" };
  if (/\b(new|got a|have a|met a|meeting a|signed|add)\b.*\b(buyer|seller|renter|tenant|investor|lead|client|prospect)\b/.test(t) || /\badd\b.+\bas (a |an )?(buyer|seller|lead|renter|investor|client)\b/.test(t)) return { intent: "new_contact" };
  if (/\b(haven'?t|have not|hasn'?t)( i| we| you)? (talked|spoken|heard|reached|contacted|followed|checked)|gone (quiet|cold|silent)|\bwho.*\b(ghost|stale|cold|slipp|forgot)|long (time|while) since\b/.test(t)) return { intent: "priorities" };
  if (/\bwho\b.*\b(follow|reach out|contact|call|text|email|check in)\b|\b(follow.?ups?|to.?do|on my plate|need(?:s)? my attention|priorit)\b.*\b(today|now|first|this week)\b|\bwhat should i (?:do|work on)\b|\bwhat do i need to (?:do|get done)\b|\bwhat'?s (?:on|next)\b.*\b(today|plate)\b|^who do i need/.test(t)) return { intent: "priorities" };
  if (/\b(debrief|brief me|catch me up|summary of my day|daily summary|morning brief|my day)\b/.test(t)) return { intent: "debrief" };
  if (/\b(market|inventory|home prices?|home values?|days on market|median|mortgage rates?|interest rates?|housing)\b|what'?s happening in|what are buyers seeing|trends? in\b/.test(t)) return { intent: "market" };
  if (/\b(find|show|search|get|list)\b.*\b(something|homes?|houses?|listings?|properties|condos?|townhomes?)\b.*\bfor\b|\bfind something for\b/.test(t)) return { intent: "find_property" };
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
