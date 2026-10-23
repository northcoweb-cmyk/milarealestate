import type { Ctx } from "../context";
import type { ActionButton } from "../../types";
import { type HandlerOut, reply } from "./types";

interface Topic { key: string; test: RegExp; text: string; buttons?: ActionButton[] }
const go = (label: string, href: string): ActionButton => ({ label, style: "secondary", href });

/** Questions about Mila itself (plans, credits, connections, support). Answered from the facts, never guessed, and free. */
const TOPICS: Topic[] = [
  { key: "pricing", test: /\b(?:how much (?:does|is|do) (?:mila|it|this|the app)|what does mila cost|what(?:'s| is) (?:the )?(?:price|pricing|cost) (?:of|for) mila|how much (?:is|are) (?:the |your )?(?:plans?|subscription|membership)|mila(?:'s)? pricing|what(?:'s| is) your pricing)\b/, text: "Mila is $39 a month and includes 1,200 credits that refill every month. The annual plan is $390 a year (two months free) with 500 bonus credits on top. You start with a 7-day free trial and no card is needed.", buttons: [go("See plans", "/settings/credits")] },
  { key: "credits", test: /\b(?:what (?:are|is) (?:a )?credits?|how (?:do|does) credits? work|how many credits|buy (?:more )?credits|top ?up (?:my )?credits|(?:ran|run|running) out of credits|out of credits)\b/, text: "Credits pay for what Mila does. A quick question costs 1 credit, an email or post about 2, and a bigger research run more. Your plan credits refill each month and don't roll over. Credits you buy or earn from referrals never expire and are used after your plan credits.", buttons: [go("Credits & billing", "/settings/credits")] },
  { key: "trial", test: /\b(?:how long (?:is|does) (?:the |my )?(?:free )?trial|free trial (?:work|last|end|include)|what happens (?:when|after) (?:the |my )?trial)\b/, text: "The free trial is 7 days with no card. When it ends your account becomes view-only: everything you added is kept and you can still look at it, but you'll need a plan to chat with Mila or make changes.", buttons: [go("See plans", "/settings/credits")] },
  { key: "cancel", test: /\b(?:how (?:do|can) i cancel|cancel (?:my )?(?:subscription|plan|membership|account)|stop (?:my )?(?:subscription|plan))\b/, text: "Go to Settings, then Credits & billing, then Manage subscription. Cancelling stops the next renewal and you keep access until the period you paid for ends.", buttons: [go("Open billing", "/settings/credits")] },
  { key: "calendar", test: /^(?:how (?:do|can) i|can (?:you|i)|is there a way to|where (?:do|can) i)\b.*\b(?:connect|sync|link|add|show|see|get)\b.*\b(?:calendar|iphone|apple|google)\b/, text: "Your Mila calendar works on its own. To get Mila's events on your phone: on the Calendar screen tap \"Add to Apple Calendar\" (iPhone and Mac), or connect Google once under Connections and Mila adds each event as she makes it. Mila only adds events; she never reads your calendar.", buttons: [go("Open Calendar", "/calendar"), go("Connections", "/settings/connections")] },
  { key: "import", test: /\b(?:how (?:do|can) i (?:import|upload|add|bring in) (?:my )?(?:contacts?|clients?|leads?|people|a (?:spreadsheet|sign-?in sheet))|import (?:my )?contacts)\b/, text: "Go to Contacts and tap Add. You can paste a list, upload a file or a photo of a sign-in sheet, import your Google Contacts, or paste a Google Sheets link. Mila shows you everyone first, so you can untick anyone and fix any detail before they're added.", buttons: [go("Open Contacts", "/contacts")] },
  { key: "support", test: /\b(?:contact support|talk to (?:a )?(?:human|person|someone|support)|customer support|report a bug|something(?:'s| is) (?:broken|wrong) with (?:the app|mila)|i need help with (?:my )?(?:account|billing))\b/, text: "Go to Settings, then Help & support, and send us a ticket. A person reads every one and replies in 48 to 72 hours, by email and inside the app. You can also tap the Flag button on any screen to report something that looks off.", buttons: [go("Help & support", "/settings/support")] },
  { key: "referral", test: /\b(?:how (?:do|does|can) (?:i|the) (?:refer|referral|invite)|refer a friend|invite (?:a )?(?:friend|agent) (?:to mila|and earn)|my referral (?:code|link)|referral program|earn (?:free )?credits)\b/, text: "Invite an agent and you both get credits. You earn 200 credits when a friend subscribes monthly (550 for annual), and they get 100 (400 for annual) as a welcome bonus. Friends enter your code when they create their account.", buttons: [go("Invite & earn", "/refer")] },
  { key: "data", test: /\b(?:is my data (?:safe|private|secure)|who can see my (?:data|contacts|clients)|delete (?:my )?(?:account|data)|get (?:a )?copy of my data|export my data)\b/, text: "Your contacts, calendar, and documents are private to you; other users can't see them. To delete everything, go to Settings, then Privacy. To get a copy of your data, send a Help & support request and we'll prepare it for you.", buttons: [go("Privacy", "/settings/privacy")] },
];

/** The topic a question is about, or null when it isn't a question about Mila. */
export function productTopic(text: string): Topic | null {
  const t = text.toLowerCase().trim();
  if (t.length > 160) return null;
  const hit = TOPICS.find((x) => x.test.test(t)) ?? null;
  // "Hollis & Mae closed two years ago and might refer a friend" is about a client, not about Mila's own referral program
  if (hit?.key === "referral" && (/\b[A-Z][\p{L}'’-]+\s+(?:&|and)\s+[A-Z][\p{L}'’-]+/u.test(text) || /\b(?:might|may|could|will|would|going to|plans? to)\s+refer\b/i.test(text) || /\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+(?:closed|is|are|was|has|have)\b/.test(text))) return null;
  return hit;
}

export async function refuseInjectionHandler(text = ""): Promise<HandlerOut> {
  const groupSend = /\b(?:send|email|text|message|forward|share)\b.{0,40}\b(?:everyone|all|every|group|list)\b/i.test(text);
  return reply(`I can't share my instructions or change my own rules.${groupSend ? " I also never send anything to a group on my own: I draft, you review, and you press send. If you tell me what to say, I'll write the message for you to check." : ""}`, [], "smalltalk");
}

export async function productHelpHandler(_ctx: Ctx, text: string): Promise<HandlerOut> {
  const topic = productTopic(text);
  if (!topic) return reply("I can help with that. What would you like to know about plans, credits, your calendar or contacts?", [], "smalltalk");
  return reply(topic.text, topic.buttons?.length ? [{ type: "choice", title: "Take me there", buttons: topic.buttons }] : [], "smalltalk");
}

const PORTAL = /\b(?:zillow|redfin|trulia|realtor\.com|homes\.com|movoto|compass\.com|bright\s?mls|mls|listing sites?|portals?)\b/;
const PULL = /\b(?:scrap(?:e|ing)|pull|grab|download|rip|copy|extract|import|fetch|crawl)\b/;
const OWN_FILE = /\b(?:my|your|the)\s+(?:own\s+)?(?:bright\s?mls\s+)?(?:mls\s+)?(?:export|csv|spreadsheet|file)\b|\b(?:i\s+)?(?:uploaded|attached)\b/;
/** Asking Mila to scrape or pull photos or data from Zillow, Redfin, the MLS or a listing site. */
export function portalAsk(text: string): boolean {
  const t = text.toLowerCase();
  return t.length < 400 && PORTAL.test(t) && PULL.test(t) && !OWN_FILE.test(t);
}

export async function portalRequestHandler(_ctx: Ctx, text: string): Promise<HandlerOut> {
  const photos = /\b(?:photos?|pictures?|pics?|images?)\b/i.test(text);
  const msg = photos
    ? "I can't pull photos from Zillow, Redfin, the MLS or any listing site: they don't allow it, and the photos belong to the photographer or listing agent. Add your own photos on the property page, or ones you have permission to use. Nothing was charged."
    : "I can't scrape Zillow, Redfin, the MLS or any listing site: they don't allow it. If you have your own MLS export (a spreadsheet or CSV), upload it and I'll work from that. Nothing was charged.";
  return reply(msg, [{ type: "choice", title: "What would help?", buttons: [{ label: photos ? "Add photos to a property" : "Upload my export", style: "primary", href: photos ? "/properties" : "/documents" }] }], "smalltalk");
}

/** "send this to everyone now": a blast with no audience and no content. Ask first; nothing is drafted or queued. */
export function vagueBulk(text: string): boolean {
  const t = text.toLowerCase();
  if (!/\b(?:send|email|text|message|blast|forward|draft|write|txt)\b/.test(t) || !/\b(?:everyone|everybody|all of (?:them|my (?:contacts|clients|leads))|my whole list)\b/.test(t)) return false;
  // "this"/"it" with nothing in the message that says what it is
  return /\b(?:this|that|it|smth|something|a message|a note|an email|a text)\b/.test(t) && !/\b(?:open house|listing|just listed|price|market|update|newsletter|about|saying|that says)\b/.test(t);
}

export async function vagueBulkHandler(_ctx: Ctx, _text: string): Promise<HandlerOut> {
  return reply("Before I draft anything: who is \"everyone\" (all contacts, buyers, sellers, or people from one open house?), and what should the message say? I won't create or send anything until you tell me.", [{ type: "choice", title: "Who is it for?", buttons: [
    { label: "Buyers", style: "secondary", action: { type: "prompt", text: "Draft an email to all my buyers" } },
    { label: "Sellers", style: "secondary", action: { type: "prompt", text: "Draft an email to all my sellers" } },
    { label: "An open house", style: "secondary", action: { type: "prompt", text: "Follow up with everyone from my last open house" } },
  ] }], "smalltalk");
}

/** "it was priya or dana, I forget": two names and a doubt. Ask, write nothing. */
export function unsureWho(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(?:i forget|i forgot|not sure|don'?t remember|can'?t remember|i think it was|whoever it was)\b/.test(t) && /\b[a-z]{2,}\s+or\s+[a-z]{2,}\b/.test(t);
}

export async function unsureWhoHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const words = new Set(text.toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/));
  const people = (await ctx.store.list("contacts", ctx.userId)).filter((c) => c.name && words.has(c.name.toLowerCase().split(/\s+/)[0]));
  const note = /\bthey\s+(.+?)(?=,|\s+and\s+(?:also|what|remind)|$)/i.exec(text)?.[1]?.trim();
  const names = people.slice(0, 4).map((c) => c.name);
  const ask = names.length > 1 ? `Which one was it: ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}?` : "Which contact was it?";
  return reply(`${ask} I haven't saved anything yet. Tell me who, and the day of the call, and I'll add the note and then handle the rest (your week and the reminder).`, names.length > 1 ? [{ type: "choice", title: "Who was it?", buttons: people.slice(0, 4).map((c) => ({ label: c.name, style: "secondary" as const, action: { type: "prompt" as const, text: `Add a note to ${c.name}${note ? `: they ${note}` : ""}` } })) }] : [], "smalltalk");
}

/** "What's the price of 14 Ridge Road?" / "which properties are under $500,000?": answered from the saved records, never a contact question. */
const FIELD = /\b(price per (?:sq\.? ?ft|square (?:foot|feet))|(?:list |asking )?price|asking|how much|cost|bedrooms?|beds?|bathrooms?|baths?|sq\.? ?ft|sqft|square (?:feet|footage)|how big|zip(?: code)?|year built|status)\b/;
export function propertyFieldAsk(text: string, hasAddress: boolean): boolean {
  const t = text.toLowerCase().trim();
  if (/\b(?:change|update|set|make|fix|correct|drop|raise|lower|reduce|is now|now \$|to \$)\b/.test(t) || !/\?\s*$|^(?:what|how|whats|what's|which|does|is|do)\b/.test(t)) return false;
  return hasAddress && FIELD.test(t) && /^(?:(?:ok|and|also|so|hey|mila)[,\s]+)*(?:what|what's|whats|how|does|is|do|which)\b/.test(t);
}
export function propertyListAsk(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(?:new|newest|latest|last|recent|bed(?:room)?s?|bd|bath|for sale|on the market|in the area|near)\b/.test(t)) return false; // searches of the market, not questions about what's saved
  return /^(?:(?:ok|and|so|hey)[,\s]+)*(?:which|how many|list|show me)\b.*\b(?:(?:my|saved) (?:properties|listings)|properties|listings)\b.*\b(?:under|below|over|above|less than|more than|at least|at most)\b/.test(t) && /\$|\d/.test(t) && !/\b(?:buyers?|clients?|for (?:my|a) )\b/.test(t);
}
