import { parseDate, parseTime } from "./nlu";

export type Intent =
  | "client_search" | "prep_property" | "meeting_prep" | "showing_followups" | "listing_ready" | "what_missing" | "new_listings" | "transaction" | "closed_deal" | "log_interaction" | "draft_text" | "week_overview" | "pipeline_value" | "add_listing" | "time_off" | "open_house" | "move_event" | "cancel_event" | "create_event" | "reminder" | "new_contact" | "priorities" | "market"
  | "debrief" | "find_contacts" | "signin_paste" | "batch_followups" | "social_post" | "draft_email" | "email_audience" | "recall" | "save_memory"
  | "find_property" | "delete_data" | "listing_link" | "showing_sheet" | "agenda" | "update_listing" | "undo" | "smalltalk" | "general";

export const INTENTS: Intent[] = ["client_search", "prep_property", "meeting_prep", "showing_followups", "listing_ready", "what_missing", "new_listings", "transaction", "closed_deal", "log_interaction", "draft_text", "week_overview", "pipeline_value", "add_listing", "time_off", "open_house", "move_event", "cancel_event", "create_event", "reminder", "new_contact", "priorities", "market", "debrief", "find_contacts", "signin_paste", "batch_followups", "social_post", "draft_email", "email_audience", "recall", "save_memory", "find_property", "delete_data", "listing_link", "showing_sheet", "agenda", "update_listing", "undo", "smalltalk", "general"];

export interface Detected { intent: Intent; declared?: boolean }

const STREET = /\b\d{1,6}\s+(?!(?:a\.?m|p\.?m)\b)[a-z0-9'.]+(?:\s+[a-z0-9'.]+){0,3}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|boulevard|pl|place|ter|terrace|cir|circle|pkwy|parkway|hwy|highway|trl|trail|loop)\b/;


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
export function isResearchTask(raw: string): boolean {
  const t = raw.toLowerCase().trim();
  if (t.length < 12 || OWN_WORK.test(t)) return false;
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
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening)|thanks|thank you|thx|ok|okay|cool|great|got it)[\s!.,]*(mila)?[\s!.]*$/.test(t)) return { intent: "smalltalk" };

  const moveVerb = /\b(move|moved|moving|reschedule|rescheduled|push|pushed|change|changed|postpone|postponed|shift|shifted|switch|switched|bump|bumped|bumping|pushing)\b/;
  const past = /\bi\s+(?:just\s+)?(moved|rescheduled|changed|pushed|postponed|shifted|switched)\b|\bit(?:'s| is| has been)\s+(?:been\s+)?(moved|rescheduled|changed)\b|\b(?:got|has been|was)\s+(moved|rescheduled|changed)\b/.test(t);
  const eventNoun = /\b(open house|showing|tour|appointment|meeting|call|lunch|dinner|coffee|closing|inspection|walkthrough|event|consult)/;
  const isQuestion = /^(what|when|who|where|how|do|did|is|are|can|could|should|why|which)\b|\?\s*$/.test(t) && !/^(can|could) (?:you|we) (?:please )?(?:move|reschedule|push|schedule|book|set|put|cancel|make|create|write|draft|add)\b/.test(t);
  // "I usually do open houses on Saturdays" / "I never show on Sundays" is something to remember, not something to book
  if (/\bi(?:'ll| will)? (?:usually|always|normally|typically|generally|tend to|never|rarely)\b/.test(t) && !/\b(remind me|schedule|book|cancel|move|reschedule)\b/.test(t) && !isQuestion) return { intent: "save_memory" };
  if (/\bremind me\b|\bset (?:a )?reminder\b/.test(t)) return { intent: "reminder" };
  // "tell her I can't help" / "let Aisha know ..." / "yes draft that" is a message to write, not a search or a calendar change
  if (!isQuestion && /^(?:(?:yah|yeah|yep|yes|ok|okay|sure|please|pls|go ahead|and|then)[,.!\s]+)*(?:(?:tell|notify|message|let)\s+(?!me\b|us\b|you\b)(?:her|him|them|[a-z]+)(?:\s+know)?\s+(?:that\s+)?\S|(?:draft|write)\s+(?:that|it|one|a message|an email)\b)/.test(t) && !/\b(?:showing|open house|moved?|reschedul\w+)\b/.test(t)) return { intent: "draft_email" };
  // "undo", "put it back", "go back to the original time"
  if (!isQuestion && t.split(/\s+/).length <= 8 && /^(?:(?:please|pls|plz|hey|ok|okay|actually|nvm|never ?mind|oops|wait|sorry)[,.!\s]+)*(?:undo(?:\s+(?:that|it|this|the (?:last|move|change)))?|revert(?:\s+(?:that|it))?|put it back|change it back|switch it back|move it back|go back(?: to (?:the )?(?:original|old|previous|earlier)(?: time| day)?)?|back to (?:the )?(?:original|old|previous)(?: time| day)?)[.!\s]*(?:please|pls)?[.!\s]*$/.test(t)) return { intent: "undo" };
  // two or more email addresses with a lead-in is a list of people to add
  if ((raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).length >= 2 && /:/.test(raw) && !/\b(draft|write|compose|send|follow.?up)\b/.test(t)) return { intent: "signin_paste" };
  // "what's on my calendar Friday", "do I have anything tomorrow", "am I free Friday at 3", "when is my next showing"
  if (/\b(calendar|schedule|agenda)\b/.test(t) && /\b(what|whats|what'?s|show|check|see|anything|tell|pull up|read|how'?s|how is|look)\b/.test(t) && !/\b(add|put|schedule (?:a|an)|book|set up|create|block)\b/.test(t.replace(/\b(my|the) schedule\b/, "")) && !/\b(post|email|flyer)\b/.test(t)) return { intent: "agenda" };
  if (/^(?:what|whats|what'?s)\s+(?:do i have|have i got|am i doing|is on|'?s on|on for|do i got)\b|^what'?s on\b|^do i have (?:anything|something|a thing|any)\b|^anything (?:on|for|booked)\b|^am i (?:free|busy|available|open)\b|^(?:are|is) (?:there )?(?:anything|something) (?:on|booked|scheduled)\b|^(?:when|what time) (?:is|are|'?s) my (?:next |first |last )?(?:showing|appointment|meeting|call|lunch|closing|inspection|open house|tour)/.test(t) && !/\b(plate|to do|follow)/.test(t)) return { intent: "agenda" };

  // A client's search brief ("my clients want an apartment: legal weed, walkable at night, balcony, under $2,500...") is research for
  // the agent to act on, not a calendar item. It needs several requirements, a place or property word, and no street address.
  if (isClientSearch(raw) || isResearchTask(raw)) return { intent: "client_search" };
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
  if (/\b(?:prep(?:are)?|brief me|research|look ?up|pull up|pull the info|info on|details on|details for|tell me about|what do you know about|what can you tell me about|run the numbers on|get me (?:the )?(?:info|details|data) (?:on|for)|get me info on)\b/.test(t) && /\b\d{1,6}\s+[a-z0-9'.]+(?:\s+[a-z0-9'.]+){0,3}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|boulevard|pl|place|ter|terrace|cir|circle|trl|trail|pkwy|parkway|hwy)\b/.test(t) && !/\b(post|caption|instagram|email|flyer|open house|showing|appointment|meeting|call)\b/.test(t.replace(/\bprep(?:are)? for (?:the )?(?:showing|open house)/, ""))) return { intent: "prep_property" };
  if (!isQ && /\b(?:i |we )?(?:just )?closed on\b|\b(?:deal|sale) closed\b|\bwe closed\b|\bjust closed\b|\bsold (?:it|the (?:house|home|listing)|\d{1,6}\s+\w+)\b.*\bfor\b/.test(t) && !/\b(post|caption|instagram|email|flyer|draft|announce)/.test(t)) return { intent: "closed_deal" };
  if (!isQ && (/^log (?:a |the |my )?(?:call|text|email|meeting|conversation|chat)\b/.test(t) || /^(?:[A-Z][\p{L}'’-]+)(?: [A-Z][\p{L}'’-]+)?\s+(?:just\s+)?(?:called|texted|emailed|messaged|reached out|stopped by|came by|replied|responded|phoned)\b/u.test(raw.trim()) || /^(?:i )?(?:just )?(?:talked|spoke|met)\s+(?:with|to)\s+[A-Z]/.test(raw.trim()))) return { intent: "log_interaction" };
  if (!isQ && /^(?:(?:please|pls|hey|ok|okay|can you|could you)[,\s]+)*(?:text|sms|send (?:a )?text(?: message)? to)\s+(?!me\b|my\b|the\b|all\b|everyone\b)[a-z]/.test(t)) return { intent: "draft_text" };
  if (/\b(?:how(?:'s| is| does)? (?:my |the )?(?:week|schedule|month|calendar)(?: look| looking| shaping)?|what(?:'s| is) (?:coming up|on deck|happening) (?:this|next) week|week ahead|my week|do i have (?:this|next) week|what do i have (?:this|next|going on)\b)/.test(t)) return { intent: "week_overview" };
  // "who has gone cold in my pipeline" is about people to contact, not about money
  if (/\b(?:who|which|any(?:one|body)?)\b.*\b(?:gone (?:cold|quiet|silent|dark)|going cold|gone stale|slipping|ghost\w*|gone dormant)\b/.test(t)) return { intent: "priorities" };
  if (/\b(pipeline|how much (?:am i|will i|could i|can i) (?:make|earn)|my gci|commission (?:forecast|estimate|pipeline)|what(?:'s| is) my (?:business|income|numbers)|how(?:'s| is) (?:my )?business)\b/.test(t) || /\b(?:commission|comp)(?: rate)?\s*(?:is|=|of|at|:)\s*\d(?:\.\d+)?\s*%/.test(t)) return { intent: "pipeline_value" };
  if (!/\bmatch\b.*\b(?:buyers?|leads?|clients?|contacts?)\b/.test(t) && !/^(?:what|when|who|where|how|do|did|is|are|can|could|should|why)\b|\?\s*$/.test(t) && /\b(new listing|(?:new|nw) l[a-z]{3,6}n?g|got a listing|got the listing|got a new listing|just listed|just signed|i (?:just )?(?:got|signed|landed|listed|took)|add (?:a |my |the )?(?:new )?listing|add (?:a |my |the )?(?:new )?(?:property|home|house)|listing (?:at|on)|my listing)\b/.test(t) && /\b\d{1,6}\s+[a-z]|\b(listing|listed)\b/.test(t) && !/\b(open house|showing|email|post|carousel|instagram|story|caption|flyer|remind)/.test(t.replace(/\b(listing|listed) (?:at|on)\b/, "")) ) return { intent: "add_listing" };
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
  // advice about handling a situation ("how should I respond when sellers want to list over market") goes to the expert chat, not a live market lookup
  if (/^(?:how (?:should|do|can|would|could) i|what should i|should i|can i|help me|walk me|what do i say)\b/.test(t) && !/\b(today|right now|currently|this week|this month|trend|trending|rates?|median|inventory|days on market|prices? (?:in|for|of))\b/.test(t)) return { intent: "general" };
  if (/\b(market|inventory|home prices?|home values?|days on market|median|mortgage rates?|interest rates?|housing)\b|what'?s happening in|what are buyers seeing|trends? in\b/.test(t)) return { intent: "market" };
  if (/\b(find|show|search|get|list)\b.*\b(something|homes?|houses?|listings?|properties|condos?|townhomes?)\b.*\bfor\b|\bfind something for\b/.test(t)) return { intent: "find_property" };
  // "who in my database is looking for a 3 bed townhome?" / "match my new listing to my buyers"
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
