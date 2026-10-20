/**
 * Straight answers to the questions agents ask all day that don't need a lookup: offer and price reasoning, appraisal gaps,
 * confidentiality, 1031 timing, Maryland transfer tax and listing documents, hottest lead. Rule-based, so it works even when the
 * research service is down, costs the minimum, and always says what to confirm with the broker, attorney or tax adviser.
 */
import { type Ctx, fullMoney } from "../context";
import { classifyNotes } from "../comms";
import { amountsIn } from "./calc";
import { mentionedContacts } from "./contacts";
import { type HandlerOut, reply } from "./types";

export type AdviceTopic = "one_oh_three_one" | "transfer_tax" | "md_docs" | "appraisal_gap" | "offer_check" | "price_opinion" | "stale_listing" | "confidential" | "hottest_lead" | "licence";

export function adviceTopic(text: string): AdviceTopic | null {
  const t = text.toLowerCase();
  if (/^\s*(?:add|new|create|schedule|book|remind|draft|write|email|text|make|set)\b/.test(t) && !/\?/.test(t)) return null;
  if (/\b1031\b/.test(t)) return "one_oh_three_one";
  if (/\b(?:transfer|recordation)\s+tax(?:es)?\b/.test(t)) return "transfer_tax";
  if (/\b(?:md|maryland)\b.{0,30}\b(?:listing (?:documents|docs|forms|disclosures)|required (?:forms|documents|disclosures))\b|\blisting (?:documents|docs)\b|\b(?:list|listing)\b.{0,30}\b(?:md|maryland)\b.{0,30}\b(?:documents?|docs|forms|paperwork|disclosures?)\b|\b(?:documents?|docs|forms|paperwork|disclosures?)\b.{0,40}\b(?:list|listing)\b.{0,30}\b(?:md|maryland)\b/.test(t) && /\?|\b(?:what|which|list|need)\b/.test(t)) return "md_docs";
  if (/\bappraisal\b.{0,80}\b(?:under|below|short|came in|low|gap)\b|\bappraisal gap\b|\bappraised (?:low|under|at)\b/.test(t) && /\?|\boptions?\b|\bwhat (?:do|can|should)\b/.test(t)) return "appraisal_gap";
  if (/\b(?:is|would|was)\s+\$?\d[\d,.]*\s?k?\s+(?:a\s+)?(?:reasonable|good|fair|decent|too low|too high|realistic)\b|\b(?:reasonable|fair|good) offer\b|\bwants? to (?:make an? )?offer\b.{0,100}\?/.test(t)) return "offer_check";
  if (/\b(?:seems?|feels?|looks?|too)\s+(?:high|low|overpriced|underpriced|steep)\b/.test(t) && /\b(?:what do you think|thoughts|opinion|agree|right)\b|\?/.test(t) && /\$\s?\d/.test(t)) return "price_opinion";
  if (/\b(?:sitting|been (?:listed|on the market)|on the market for|no (?:offers?|showings?|traffic)|not selling|stale)\b/.test(t) && /\b\d+\s*(?:days?|weeks?|months?)\b|\bhow (?:should|do) i (?:handle|price|reduce)\b/.test(t) && /\?|\bhow\b|\bwhat\b/.test(t)) return "stale_listing";
  if (/\b(?:share|tell|give|send|release|disclose)\b.{0,60}\b(?:sale price|price|financials?|financial|information|details|numbers)\b.{0,60}\b(?:son|daughter|husband|wife|spouse|mother|mom|father|dad|brother|sister|neighbou?r|friend|relative|family|third party|their lawyer|accountant)\b|\bshould i share\b|\bis it (?:ok|okay|fine|allowed) to share\b/.test(t)) return "confidential";
  if (/\bhottest (?:lead|prospect|buyer)\b|\bwhich\b.{0,40}\b(?:lead|buyer|visitor|prospect)s?\b.{0,30}\b(?:hottest|most serious|most likely|best|ready)\b/.test(t)) return "hottest_lead";
  if (/\b(?:licen[cs]ed|licen[cs]e)\b.{0,30}\b(?:in|for)\b.{0,20}\b(?:texas|tx|virginia|va|dc|florida|fl|another state|other state)\b/.test(t)) return "licence";
  return null;
}

const CAVEAT = "This is general information, not legal or tax advice.";

export async function adviceHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const topic = adviceTopic(text);
  const nums = amountsIn(text);
  switch (topic) {
    case "one_oh_three_one":
      return reply(`1031 exchange timing, in plain terms:\n• Day 0 is the closing of the property being sold.\n• 45 days: identify the replacement property (or up to three candidates) in writing to the qualified intermediary.\n• 180 days: close on the replacement, or the tax return due date for that year if sooner. Neither deadline extends for weekends or holidays.\n• The money must pass through a qualified intermediary; if the seller touches the proceeds, the exchange fails.\n• Both properties must be held for investment or business use. A primary residence like a personal condo doesn't qualify unless it was a rental.\n• To defer all the gain, buy equal or higher value and reinvest all proceeds.\nHave the seller's CPA and a qualified intermediary confirm before the listing agreement is signed. ${CAVEAT}`, [], "chat_simple");
    case "transfer_tax":
      return reply(`Maryland transfer and recordation tax, the short version:\n• The state transfer tax is 0.5% of the price (some first-time buyers get a reduction or exemption).\n• Counties add their own transfer and recordation taxes, and the rates and who pays differ by county, so confirm the county before quoting a number.\n• By custom the seller usually pays the transfer tax and the buyer the recordation tax, but the contract can change that.\nThe title company or settlement attorney can give the exact figures for a specific address and price. ${CAVEAT}`, [], "chat_simple");
    case "md_docs":
      return reply(`Documents commonly needed to list a Maryland home (your brokerage's own forms and the MAR/MLS requirements decide the final list):\n• Exclusive right to sell listing agreement\n• Seller's Property Disclosure or Disclaimer Statement\n• Lead-based paint disclosure for homes built before 1978\n• HOA or condominium resale disclosure and documents, if the home has an association\n• Agency/consumer disclosure and any MLS data input form\n• Showing instructions and access details\nAsk your broker for the current checklist before you go live. ${CAVEAT}`, [], "chat_simple");
    case "appraisal_gap": {
      const srt = [...nums].sort((x, y) => y - x);
      const small = srt.length >= 2 && srt[srt.length - 1] < srt[0] * 0.2 ? srt[srt.length - 1] : null; // "$665k … which is $15k under": the small figure is the gap
      const [a, b] = srt.length < 2 ? [null, null] : small ? [srt[0], srt[0] + small] : [srt[1], srt[0]];
      const gap = a && b ? ` With the appraisal at ${fullMoney(a)} against a ${fullMoney(b)} contract, the gap is ${fullMoney(b - a)}.` : "";
      return reply(`When an appraisal comes in under the contract price, the usual options are:${gap}\n• Ask the seller to reduce the price to the appraised value.\n• Split the difference: the seller lowers the price and the buyer covers part of the gap in cash.\n• The buyer pays the full gap in cash, if the buyer can and wants the home.\n• Request a reconsideration of value from the lender with stronger comparable sales.\n• Use the appraisal contingency to renegotiate or terminate within the deadline.\nCheck the contract's appraisal contingency dates first, and confirm the plan with your broker. ${CAVEAT}`, [{ type: "choice", title: "Want help with this?", buttons: [{ label: "Draft a note to the seller's agent", style: "secondary", action: { type: "prompt", text: "Draft an email to the seller's agent about the low appraisal" } }] }], "chat_simple");
    }
    case "offer_check": {
      const [lo, hi] = nums.length >= 2 ? [Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])] : [null, null];
      const pct = lo && hi ? `${(((hi - lo) / hi) * 100).toFixed(1)}%` : null;
      return reply(`${lo && hi ? `${fullMoney(lo)} against ${fullMoney(hi)} is ${fullMoney(hi - lo)} (${pct}) below the asking price. ` : ""}Whether that's reasonable depends on three things I'd check before advising the buyer:\n• Recent comparable sales within a half mile, and whether they closed over or under asking.\n• Days on market and price changes: a home sitting for weeks gives more room than one with multiple offers.\n• The buyer's strength: pre-approval, down payment, flexibility on closing and contingencies.\nA close offer with clean terms often beats a higher offer with contingencies. Pull comps for the address and I'll lay them next to this price. ${CAVEAT}`, [], "chat_simple");
    }
    case "price_opinion":
      return reply(`I can't call a price high or low without comparable sales, and I won't guess. What decides it: recent sales of similar homes (age, size, condition, updates like the kitchen), how long comparable listings sat, and the price per square foot in that neighborhood. If you tell me the address I can compare it with homes you've saved, or you can pull a CMA from your MLS. ${CAVEAT}`, [], "chat_simple");
    case "stale_listing":
      return reply(`A listing at 60 days with little activity is usually a price or presentation problem. A sensible order:\n1. Look at the numbers: showings per week, feedback, and how many comparable homes sold or reduced since you listed.\n2. If showings are low, the price or photos are the problem; if showings are high but no offers, it's price or condition.\n3. A reduction that matters is typically 3-5% (small cuts of 1% rarely move buyers), and it works best when timed with fresh photos and a new MLS push.\n4. Talk to the seller about the next price point before you change it, and put their approval in writing.\nIf you tell me the list price and the feedback you've had, I'll write up the options for the seller. ${CAVEAT}`, [], "chat_simple");
    case "confidential": {
      const c = (await mentionedContacts(ctx, text))[0];
      const who = c ? c.name.split(" ")[0] : "your client";
      return reply(`Don't share it yet. A client's sale price and finances are confidential, and a family member isn't entitled to them without ${who}'s written permission (your agency and confidentiality duties, and your brokerage's policy). The safe move: ask ${who} first, get the permission in writing, then share only what they approve. If the price is already in public records after closing, that's different, but it's still ${who}'s call. Check with your broker if you're unsure.`, [{ type: "choice", title: "Want me to help?", buttons: [{ label: `Draft a note asking ${who} for permission`, style: "secondary", action: { type: "prompt", text: `Draft an email to ${c?.name ?? "my client"} asking permission before I share sale details with a family member` } }, { label: "Remind me to get it in writing", style: "quiet", action: { type: "prompt", text: `Remind me tomorrow at 9 to get written permission from ${c?.name ?? "my client"}` } }] }], "chat_simple");
    }
    case "hottest_lead": {
      const all = (await ctx.store.list("contacts", ctx.userId)).filter((c) => ["buyer", "lead", "rental", "investor"].includes(c.type) && c.status !== "inactive");
      const recent = all.filter((c) => Date.now() - new Date(c.created_at).getTime() < 14 * 86_400_000);
      const pool = (recent.length >= 2 ? recent : all);
      const mems = await ctx.store.list("memories", ctx.userId);
      const scored = pool.map((c) => {
        const cm = mems.filter((m) => m.scope === "contact" && m.subject_id === c.id).map((m) => `${m.key} ${m.value}`).join(" ") + ` ${c.notes ?? ""}`;
        const why: string[] = []; let score = (c.importance ?? 2);
        if (/pre-?approv/i.test(cm)) { score += 3; why.push("pre-approved"); }
        if (classifyNotes(cm) === "hot") { score += 3; why.push("ready to move"); }
        if (c.budget_max) { score += 1; why.push(`budget ${fullMoney(c.budget_max)}`); }
        if (/\b(this month|asap|offer|second showing|tour|toured)\b/i.test(cm)) { score += 2; why.push("asked about next steps"); }
        if (c.last_contact_at && Date.now() - new Date(c.last_contact_at).getTime() < 7 * 86_400_000) { score += 1; why.push("recent contact"); }
        return { c, score, why };
      }).sort((x, y) => y.score - x.score).slice(0, 3);
      if (!scored.length || scored.every((x) => !x.why.length)) return reply("I don't have enough saved on your leads to rank them: no pre-approvals, timelines or notes. Tell me what each one said (budget, timing, whether they're pre-approved) and I'll rank them.", [], "chat_simple");
      return reply(`Based on what's saved, your hottest lead is ${scored[0].c.name}${scored[0].why.length ? ` (${scored[0].why.join(", ")})` : ""}.\n${scored.map((x, i) => `${i + 1}. ${x.c.name}: ${x.why.join(", ") || "not much saved yet"}`).join("\n")}\nThis comes only from the notes and facts you've given me.`, [], "chat_simple");
    }
    case "licence":
    default:
      return reply(`Real estate licences are state by state. Before you take a showing, listing or client work in another state, confirm with your broker whether you're licensed there or need a referral to a local agent. Referral fees between licensees are normal and usually written down in a referral agreement. ${CAVEAT}`, [], "chat_simple");
  }
}
