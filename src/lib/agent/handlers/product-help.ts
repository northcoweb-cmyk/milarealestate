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
  return TOPICS.find((x) => x.test.test(t)) ?? null;
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
