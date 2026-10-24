/**
 * Number questions answered from the numbers themselves, never from a list and never from the AI service: mortgage payment,
 * seller net sheet, net price with a credit, price-reduction percentage, commission, affordability, and questions about
 * budgets already saved on contacts ("which buyers are under $600k", "compare Desmond's budget to Corinne's").
 * Every answer says which assumptions it used. Nothing is saved.
 */
import { persistState } from "../conversation";
import { type Ctx, fullMoney } from "../context";
import { aiConfigured as aiAvailable } from "../../ai/configured";
import { parseAddress, parseMoney } from "../nlu";
import { resolveProperty } from "./listing";
import { mentionedContacts } from "./contacts";
import { type HandlerOut, reply } from "./types";
import { startOfDay } from "../../time";

export const amountsIn = (text: string): number[] => amounts(text);
const amounts = (text: string): number[] =>
  [...text.matchAll(/\$?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)\b|\$\s?(\d[\d,]*(?:\.\d+)?)|\b(\d{1,3}(?:,\d{3})+)\b/gi)]
    .map((m) => { const n = parseFloat((m[1] ?? m[3] ?? m[4]).replace(/,/g, "")); return /k/i.test(m[2] ?? "") ? n * 1000 : /m/i.test(m[2] ?? "") ? n * 1e6 : n; })
    .filter((n) => n >= 1000);
const percents = (text: string): number[] => [...text.matchAll(/(\d+(?:\.\d+)?)\s?%(?:\s*\/\s*(\d+(?:\.\d+)?))?/g)].flatMap((m) => (m[2] ? [parseFloat(m[1]), parseFloat(m[2])] : [parseFloat(m[1])]));

export type CalcKind = "recap" | "payment" | "net_sheet" | "net_price" | "reduction" | "commission" | "affordable" | "budget_filter" | "budget_compare" | "unknown_fact" | "cash_to_close" | "recalc";


/** The amount written right before or after a label ("$380,000 payoff", "payoff of $380k", "payoff: 380000"). */
function labelled(text: string, labels: string): number | null {
  const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?(?:\s?[km]\b)?)`; // no trailing comma, and a k/m only when it stands alone ("380,000 mortgage" is not 380,000 million)
  const before = new RegExp(String.raw`(?<![\w.,])\$?\s?${NUM}(?:\s?[km]\b)?\s*(?:in |for |of )?(?:${labels})\b`, "i").exec(text);
  const after = new RegExp(String.raw`\b(?:${labels})\b(?:\s*(?:of|at|is|are|was|=|:|-))?\s*\$?\s?${NUM}(?:\s?[km]\b)?(?!\s?%)`, "i").exec(text);
  const raw = before?.[1] ?? after?.[1];
  return raw ? parseMoney(`$${raw.replace(/\s/g, "")}`).max ?? null : null;
}
/** The percent written next to a label ("5.5% commission", "commission of 5.5%", "1% taxes"). */
function labelledPct(text: string, labels: string): number | null {
  const m = new RegExp(String.raw`(\d+(?:\.\d+)?)\s?%\s*(?:in |for |of )?(?:${labels})\b|\b(?:${labels})\b(?:\s*(?:of|at|is|=|:))?\s*(\d+(?:\.\d+)?)\s?%`, "i").exec(text);
  return m ? parseFloat(m[1] ?? m[2]) : null;
}

export function calcKind(text: string): CalcKind | null {
  const t = text.toLowerCase();
  if (/^\s*(?:add|new|create|schedule|book|remind|draft|write|email|text)\b/.test(t)) return null;
  if (/\b(?:summari[sz]e|recap|sum up|go over|list)\b.{0,25}\b(?:everything|all|what)\b.{0,20}\b(?:we|i|you)\b.{0,20}\b(?:did|done|covered|got done|worked on)\b/.test(t) && !/\b(?:chat|conversation|thread)\b/.test(t)) return "recap";
  if (/^\s*(?:and\s+|ok(?:ay)?[,\s]+)?(?:what if|how about|what about|and if|try)\b.{0,50}\b(?:rates?|interest|\d+(?:\.\d+)?\s?%|\d{2}[- ]?(?:year|yr)s?|years?)\b/.test(t)) return "recalc";
  if (/\b(?:monthly )?payment\b/.test(t) && percents(text).length && !amounts(text).length && /\b(?:what|how much|what's|whats)\b/.test(t)) return "payment";
  if (/^\s*(?:(?:ok|so|and|hey)[,\s]+)*(?:what|which)\b.{0,25}\b(?:did i|have i|did we|have we)\b.{0,30}\b(?:get done|do|done|finish|finished|accomplish\w*|complete\w*|add\w*)\b.{0,25}\b(?:today|this week|so far|yesterday)\b|^\s*(?:daily |weekly )?recap\b/.test(t) && !/\bwhat did i (?:say|tell|promise)\b/.test(t)) return "recap";
  if (/\breduction (?:percent|percentage|%)|\bpercent(?:age)? (?:off|reduction|drop|decrease)|\bhow much (?:of a )?(?:drop|reduction)\b/.test(t) && amounts(text).length >= 2) return "reduction";
  if (/\b(?:effective )?net price\b/.test(t) && /\b(?:credit|concession)\b/.test(t)) return "net_price";
  if (/\b(?:seller )?net sheet\b|\bseller(?:'s)? (?:net|gross|proceeds)\b|\bnet proceeds\b|\bnet (?:to|for) (?:my |the |a )?(?:seller|client|owner)\b|\bwhat (?:will|would|does) (?:the )?seller (?:net|walk away)/.test(t) && (amounts(text).length >= 1 || /\bnet sheet\b/.test(t))) return "net_sheet";
  if (/\b(?:cash (?:to|needed to|will .{0,25}need to) close|cash (?:needed|required)|how much (?:cash|money) .{0,40}(?:to close|at closing|to buy)|closing (?:costs|cash))\b/.test(t) && amounts(text).length) return "cash_to_close";
  if (/\bcommission\b/.test(t) && percents(text).length && (amounts(text).length || /\b\d{1,6}\s+[a-z]/.test(t))) return "commission";
  if (/\b(?:monthly )?(?:payment|piti|mortgage|principal and interest|p&i)\b/.test(t) && (amounts(text).length || /\bpiti\b/.test(t)) && !/\b(?:late|missed|reminder|due)\b/.test(t)) return "payment";
  if (/\b(?:afford|affordable)\b/.test(t) && !/\bwhat (?:is|are) the/.test(t)) return "affordable";
  if (/\b(?:which|what|list|show|who)\b.{0,30}\b(?:buyers?|clients?|leads?|sellers?)\b.{0,40}\b(?:under|below|over|above|more than|less than)\s+\$?\d/.test(t)) return "budget_filter";
  if (/\bcompare\b.{0,40}\bbudgets?\b|\bbudget\b.{0,40}\bcompare\b|\bhow does\b.{0,40}\bbudget\b.{0,30}\bcompare\b/.test(t)) return "budget_compare";
  if (/\b(?:property tax(?:es)?(?: rate)?|tax rate|hoa(?: fees?| dues)?|condo fees?|insurance rate)\b/.test(t) && /\?|^\s*(?:what|how|hoa|property tax)/.test(t) && !/\b(?:say|respond|response|reply|answer|explain|script|tell|talk|handle|objection|words?)\b/.test(t) && !(aiAvailable() && !parseAddress(text) && !/\b(?:this|that|the|my) (?:home|house|property|listing)\b/.test(t))) return "unknown_fact"; // a county or market tax question goes to the assistant; only a saved home's own figures are "not on file"
  return null;
}

/** principal, annual rate %, years -> monthly principal and interest */
export function monthlyPI(principal: number, ratePct: number, years = 30): number {
  const r = ratePct / 100 / 12, n = years * 12;
  return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function calcHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const kind = calcKind(text);
  const nums = amounts(text), pcts = percents(text);
  switch (kind) {
    case "recap": {
      const week = /this week/i.test(text), yday = /yesterday/i.test(text);
      const today = startOfDay(ctx.now, ctx.tz);
      const from = week ? new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86_400_000) : yday ? new Date(today.getTime() - 86_400_000) : today;
      const to = yday ? today : new Date(ctx.now.getTime() + 1);
      const within = (iso?: string | null) => !!iso && new Date(iso) >= from && new Date(iso) < to;
      const [tasks, contacts, props, events, posts] = await Promise.all(["tasks", "contacts", "properties", "calendar_events", "social_posts"].map((t) => ctx.store.list(t as "tasks", ctx.userId))) as [any[], any[], any[], any[], any[]];
      const done = tasks.filter((t) => t.status === "done" && within(t.completed_at));
      const newC = contacts.filter((c) => !c.is_demo && within(c.created_at)), newP = props.filter((p) => !p.is_demo && within(p.created_at));
      const newE = events.filter((e) => e.status === "confirmed" && within(e.created_at)), newPosts = posts.filter((p) => within(p.created_at));
      const span = week ? "this week" : yday ? "yesterday" : "today";
      const rems = (await ctx.store.list("reminders", ctx.userId)).filter((r) => r.status !== "cancelled" && within(r.created_at));
      const happened = events.filter((e) => e.status === "confirmed" && within(e.start_at) && new Date(e.end_at) <= ctx.now && e.notes !== "Transaction milestone");
      const lines = [
        done.length ? `• Finished ${done.length} to-do${done.length === 1 ? "" : "s"}: ${done.slice(0, 4).map((t) => t.title).join("; ")}` : "",
        newC.length ? `• Added ${newC.length} contact${newC.length === 1 ? "" : "s"}: ${newC.slice(0, 5).map((c) => c.name).join(", ")}` : "",
        newP.length ? `• Added ${newP.length} propert${newP.length === 1 ? "y" : "ies"}: ${newP.slice(0, 4).map((p) => p.address).join("; ")}` : "",
        newE.length ? `• Put ${newE.length} event${newE.length === 1 ? "" : "s"} on your calendar: ${newE.slice(0, 4).map((e) => e.title.split(" — ")[0]).join("; ")}` : "",
        rems.length ? `• Set ${rems.length} reminder${rems.length === 1 ? "" : "s"}: ${[...new Set(rems.map((r) => r.title))].slice(0, 4).join("; ")}` : "",
        happened.length ? `• Had ${happened.length} thing${happened.length === 1 ? "" : "s"} on the calendar: ${happened.slice(0, 4).map((e) => e.title.split(" — ")[0]).join("; ")}` : "",
        newPosts.length ? `• Prepared ${newPosts.length} post draft${newPosts.length === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      return reply(lines.length ? `Here's what got done ${span}:\n${lines.join("\n")}` : `Nothing is recorded as done ${span} yet. Add a contact, finish a to-do or schedule something and it shows up here.`, [], "chat_simple");
    }
    case "reduction": {
      const [a, b] = nums, from = Math.max(a, b), to = Math.min(a, b);
      return reply(`${fullMoney(from)} to ${fullMoney(to)} is a ${fullMoney(from - to)} reduction, about ${r2(((from - to) / from) * 100)}%.`, [], "chat_simple");
    }
    case "net_price": {
      const price = nums[0], credit = nums.find((n, i) => i > 0 && n < price) ?? 0;
      if (!price || !credit) return reply("Give me the contract price and the credit amount and I'll work it out.", [], "chat_simple");
      return reply(`Effective net price: ${fullMoney(price)} − ${fullMoney(credit)} = ${fullMoney(price - credit)}. A seller credit usually covers the buyer's closing costs rather than lowering the contract price, so the recorded price stays ${fullMoney(price)}.`, [], "chat_simple");
    }
    case "cash_to_close": {
      if (/\b(?:put down|down payment (?:can|could|would)|can (?:they|he|she|i|we) (?:put|afford) down|how much (?:down|can))\b/i.test(text) && /\b(?:cash|saved|savings|has|have|got)\b/i.test(text)) {
        const cash = labelled(text, "cash|saved|savings") ?? nums[0];
        const home = labelled(text, "home|house|property|purchase|price") ?? nums.find((n) => n !== cash);
        const cpct = labelledPct(text, "closing(?: costs?)?|costs?");
        if (cash && home && cpct !== null) {
          const closingAmt = Math.round(home * cpct / 100), downAmt = cash - closingAmt;
          if (downAmt <= 0) return reply(`${fullMoney(cash)} doesn't cover ${cpct}% closing costs (${fullMoney(closingAmt)}) on a ${fullMoney(home)} home, so there is nothing left for a down payment yet.`, [], "chat_simple");
          return reply(`With ${fullMoney(cash)} in cash on a ${fullMoney(home)} home:\n• Closing costs (${cpct}%): ${fullMoney(closingAmt)}\n• Left for the down payment: ${fullMoney(downAmt)}, which is ${(downAmt / home * 100).toFixed(1)}% down.\nA lender may also want reserves, so confirm with the Loan Estimate.`, [], "chat_simple");
        }
      }
      const price = nums[0]; const down = pcts[0] ?? 20;
      if (!price) return reply("What's the purchase price? Give me the price and the down payment, like “cash to close on 600k with 10% down”.", [], "chat_simple");
      const dp = Math.round(price * down / 100), lo = Math.round(price * 0.02), hi = Math.round(price * 0.05);
      return reply(`Cash to close on ${fullMoney(price)} with ${down}% down:\n• Down payment: ${fullMoney(dp)}\n• Closing costs, typically 2% to 5% of the price: ${fullMoney(lo)} to ${fullMoney(hi)} (lender fees, title, taxes and insurance set aside up front)\n• Estimated cash to close: ${fullMoney(dp + lo)} to ${fullMoney(dp + hi)}, before any earnest money already paid (it is credited at closing) and any seller credit.\nAsk the lender for a Loan Estimate for the real number.`, [], "chat_simple");
    }
    case "commission": {
      let price = nums[0]; const pct = pcts[0]; let on = "";
      if (!price) {
        const p = await resolveProperty(ctx, text, true).catch(() => null);
        // a home under contract is worth its accepted price, not its list price
        const accepted = p ? Number(/accepted at \$([\d,]+)/.exec((await ctx.store.list("memories", ctx.userId)).find((m) => m.scope === "property" && m.subject_id === p.id && m.key === "Transaction")?.value ?? "")?.[1]?.replace(/,/g, "")) || null : null;
        if (p && accepted) { price = accepted; on = ` (${p.address}, accepted offer of ${fullMoney(accepted)}; it was listed at ${p.list_price ? fullMoney(p.list_price) : "an unsaved price"})`; }
        else if (p?.list_price) { price = p.list_price; on = ` (${p.address}, listed at ${fullMoney(p.list_price)}; give me the sale price if it differs)`; }
      }
      if (!price) return reply("What's the sale price? Give me the price and the commission, like “commission on 479k at 2.5%”.", [], "chat_simple");
      return reply(`${pct}% of ${fullMoney(price)} is ${fullMoney(Math.round(price * pct / 100))}${on}.`, [], "chat_simple");
    }
    case "net_sheet": {
      let price = labelled(text, "sale|sales price|sale price|sold|price|offer") ?? nums[0];
      let label = "";
      if (!price) { const p = await resolveProperty(ctx, text, true).catch(() => null); if (p?.list_price) { price = p.list_price; label = ` for ${p.address}`; } }
      if (!price) return reply("What's the sale price? Give me the price and the commission, like “net sheet 479k at 5.5%”.", [], "chat_simple");
      const commPct = labelledPct(text, "commissions?|comm|agent fees?|realtor fees?") ?? pcts[0] ?? null;
      const taxPct = labelledPct(text, "taxes|tax|transfer taxes?|transfer tax|closing(?: costs?)?");
      const payoff = labelled(text, "payoff|pay off|mortgage|loan balance|loan payoff|owed?|lien");
      const other = labelled(text, "other costs?|other fees?|other expenses|repairs?|credits?|concessions?|closing costs?|costs?|fees?");
      const pct = commPct ?? 5.5;
      const comm = Math.round(price * pct / 100);
      const taxes = taxPct !== null ? Math.round(price * taxPct / 100) : null;
      const otherAmt = other && other !== payoff ? other : null;
      const assumedClosing = taxes === null && otherAmt === null && payoff === null ? Math.round(price * 0.015) : 0; // nothing given: a rough 1.5% for seller-side costs and transfer taxes
      const net = price - comm - (taxes ?? 0) - (otherAmt ?? 0) - assumedClosing - (payoff ?? 0);
      const lines = [`• Gross sale price: ${fullMoney(price)}`, `• Commission (${pct}%${commPct === null ? ", assumed" : ""}): −${fullMoney(comm)}`];
      if (taxes !== null) lines.push(`• Taxes and transfer costs (${taxPct}%): −${fullMoney(taxes)}`);
      if (otherAmt !== null) lines.push(`• Other costs: −${fullMoney(otherAmt)}`);
      if (assumedClosing) lines.push(`• Closing costs and transfer taxes (about 1.5%, estimated): −${fullMoney(assumedClosing)}`);
      if (payoff !== null) lines.push(`• Loan payoff: −${fullMoney(payoff)}`);
      return reply(`Seller net sheet${label} at ${fullMoney(price)}:\n${lines.join("\n")}\n• ${payoff !== null ? "Estimated net to the seller" : "Estimated net before mortgage payoff"}: ${fullMoney(net)}${payoff === null ? "\nSubtract the loan payoff and any credits for the real number. Tell me the payoff and I'll rerun it." : "\nThe title company's settlement statement has the final number."}${taxes === null && otherAmt === null && payoff !== null ? " Closing costs and taxes aren't included. Give me those and I'll add them." : ""}`, [], "chat_simple");
    }
    case "recalc": {
      const lc = ctx.state.last_calc;
      if (!lc) return reply("Re-run what? Give me the price, down payment and rate, like “payment on 520k, 10% down at 6.25%”.", [], "chat_simple");
      const t0 = text.toLowerCase();
      const pctsHere = percents(text);
      let { down, rate, term } = lc;
      const yrs0 = /(\d{2})\s*[- ]?(?:years?|yrs?)\b/i.exec(text);
      if (yrs0) term = Math.min(40, Math.max(5, parseInt(yrs0[1], 10)));
      if (pctsHere.length) { if (/\bdown\b/.test(t0)) down = pctsHere[0]; else rate = pctsHere[0]; }
      const price0 = nums[0] ?? lc.price;
      const loan = price0 * (1 - down / 100), pi = monthlyPI(loan, rate, term);
      ctx.state.last_calc = { ...lc, price: price0, down, rate, term, at: Date.now() }; await persistState(ctx);
      const before = monthlyPI(lc.price * (1 - lc.down / 100), lc.rate, lc.term);
      const diff = Math.round(pi - before);
      return reply(`Payment${lc.label} on ${fullMoney(price0)}, ${down}% down at ${rate}% for ${term} years:\n• Loan: ${fullMoney(Math.round(loan))}\n• Principal and interest: ${fullMoney(Math.round(pi))}/month${diff ? ` (${diff < 0 ? "down" : "up"} ${fullMoney(Math.abs(diff))} from before)` : ""}\nTaxes, insurance and any HOA come on top.`, [], "chat_simple");
    }
    case "payment":
    case "affordable": {
      let price = nums[0];
      const isLoan = /\$\s?\d[\d,.]*\s?[km]?\s+(?:loan|mortgage)\b|\b(?:loan|mortgage) (?:amount )?(?:of|for|is) \$/i.test(text) && !/\b\d+(?:\.\d+)?\s?%\s*down\b/i.test(text); // "payment on a $480,000 loan": that IS the loan, nothing to subtract
      let label = "";
      const aboutThem = /\b(?:they|their|them|the couple|my buyers?)\b/i.test(text) && !/\b(?:home|house|property|listing)\b/i.test(text);
      const c1 = !price && aboutThem && ctx.state.last_contact_ids?.[0] ? await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]) : null;
      if (c1?.budget_max) { price = c1.budget_max; label = ` (${c1.name}'s budget)`; }
      const p = price ? null : await resolveProperty(ctx, text, true).catch(() => null);
      if (p?.list_price) { price = p.list_price; label = ` for ${p.address}`; }
      const contacts = await mentionedContacts(ctx, text).catch(() => []);
      if (kind === "affordable") {
        const c = contacts[0];
        const prop = p ?? (await resolveProperty(ctx, text, true).catch(() => null));
        if (c && prop?.list_price) {
          const budget = c.budget_max;
          if (!budget) return reply(`I don't have a budget saved for ${c.name}. What's their budget?`, [], "chat_simple");
          const pay = monthlyPI(prop.list_price * 0.8, 6.75);
          const verdict = prop.list_price <= budget ? `${prop.address} is listed at ${fullMoney(prop.list_price)}, within ${c.name}'s ${fullMoney(budget)} budget.` : `${prop.address} is listed at ${fullMoney(prop.list_price)}, ${fullMoney(prop.list_price - budget)} over ${c.name}'s ${fullMoney(budget)} budget.`;
          return reply(`${verdict} With 20% down at 6.75% for 30 years, principal and interest would be about ${fullMoney(Math.round(pay))}/month (taxes, insurance and HOA not included). Income and debts decide the real answer, so ask ${c.name.split(" ")[0]} for their pre-approval.`, [], "chat_simple");
        }
      }
      if (!price) { // "if they put 10% down on that": the price already talked about in this chat, or the buyer's budget
        const lc = ctx.state.last_calc;
        if (lc && Date.now() - lc.at < 2 * 3_600_000) { price = lc.price; label = lc.label; }
        else { const c0 = ctx.state.last_contact_ids?.[0] ? await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]) : null; if (c0?.budget_max) { price = c0.budget_max; label = ` (${c0.name}'s budget)`; } }
      }
      if (!price) return reply("What's the price? Give me the price, down payment and rate, like “payment on 615k, 20% down at 6.75%”.", [], "chat_simple");
      // explicit words win: "6.5% for 30 years with 10% down", "20% down at 6.75%", "at a 7% rate"
      const dExp = /(\d+(?:\.\d+)?)\s?%\s*(?:down|as a down payment)|down(?: payment)?(?: of)?\s*(\d+(?:\.\d+)?)\s?%/i.exec(text);
      const rExp = /(?:\bat|rate(?: of)?|@|interest(?: of)?)\s*(\d+(?:\.\d+)?)\s?%(?!\s*down)/i.exec(text) ?? /(\d+(?:\.\d+)?)\s?%\s*(?:rate|interest|apr)\b/i.exec(text) ?? /(\d+(?:\.\d+)?)\s?%\s*(?:for|over)\s*\d+\s*(?:years?|yrs?)/i.exec(text);
      const yrs = /(\d{2})\s*[- ]?(?:years?|yrs?)\b/i.exec(text);
      let down = dExp ? parseFloat(dExp[1] ?? dExp[2]) : undefined;
      let rate = rExp ? parseFloat(rExp[1]) : undefined;
      // "payment 550k 20% 6.5": a bare number of 2 to 12 after the down percent is the rate
      if (rate === undefined && pcts.length === 1) { const bare = /%\s*[\/,]?\s*(\d{1,2}(?:\.\d+)?)\s*$/.exec(text.trim()); if (bare && +bare[1] >= 2 && +bare[1] <= 12) rate = parseFloat(bare[1]); }
      if (down === undefined && rate === undefined) { const guessDown = pcts.find((x) => x >= 3 && x <= 60); down = guessDown; rate = pcts.find((x) => x !== guessDown && x > 0 && x < 15); }
      else if (down === undefined) down = pcts.find((x) => x !== rate && x >= 3 && x <= 60);
      else if (rate === undefined) rate = pcts.find((x) => x !== down && x > 0 && x < 15);
      const term = yrs ? Math.min(40, Math.max(5, parseInt(yrs[1], 10))) : 30;
      const rateUsed = rate ?? 6.75;
      const dp = isLoan ? 0 : down ?? 20;
      const loan = price * (1 - dp / 100);
      const pi = monthlyPI(loan, rateUsed, term);
      const tax = (price * 0.0094) / 12, ins = (price * 0.0035) / 12;
      ctx.state.last_calc = { price, down: dp, rate: rateUsed, term, label, at: Date.now() }; await persistState(ctx);
      if (isLoan) return reply(`Payment on a ${fullMoney(price)} loan at ${rateUsed}%${rate === undefined ? " (assumed)" : ""} for ${term} years:\n• Principal and interest: ${fullMoney(Math.round(pi))}/month\n• Add property tax, insurance, any HOA and mortgage insurance for the full monthly cost. Give me the home price and I'll estimate those too.`, [], "chat_simple");
      const assumed = [down === undefined && rate === undefined ? "20% down and 6.75% assumed" : down === undefined ? "20% down assumed" : rate === undefined ? "6.75% rate assumed" : ""].filter(Boolean)[0];
      return reply(`Payment${label} on ${fullMoney(price)}, ${dp}% down at ${rateUsed}% for ${term} years${assumed ? ` (${assumed})` : ""}:\n• Loan: ${fullMoney(Math.round(loan))}\n• Principal and interest: ${fullMoney(Math.round(pi))}/month\n• With estimated taxes (~0.94%) and insurance (~0.35%): about ${fullMoney(Math.round(pi + tax + ins))}/month, before any HOA or mortgage insurance.`, [], "chat_simple");
    }
    case "budget_filter": {
      const t = text.toLowerCase();
      const lim = parseMoney(text).max ?? nums[0];
      const over = /\b(?:over|above|more than)\b/.test(t);
      const type = /\bsellers?\b/.test(t) ? "seller" : /\bleads?\b/.test(t) ? "lead" : "buyer";
      const all = (await ctx.store.list("contacts", ctx.userId)).filter((c) => c.type === type && c.status !== "inactive" && c.budget_max);
      const hit = all.filter((c) => (over ? (c.budget_max as number) > lim : (c.budget_max as number) < lim));
      if (!hit.length) return reply(`None of your ${type}s with a saved budget are ${over ? "over" : "under"} ${fullMoney(lim)}. ${all.length ? "" : "No budgets are saved yet."}`.trim(), [], "chat_simple");
      return reply(`${hit.length} ${type}${hit.length === 1 ? "" : "s"} ${over ? "over" : "under"} ${fullMoney(lim)}:\n${hit.map((c) => `• ${c.name}: ${fullMoney(c.budget_max as number)}`).join("\n")}`, [], "chat_simple");
    }
    case "budget_compare": {
      const cs = (await mentionedContacts(ctx, text)).filter((c) => c.budget_max).slice(0, 4);
      if (cs.length < 2) return reply("Which two people? Name them and I'll compare the budgets I have saved.", [], "chat_simple");
      const sorted = [...cs].sort((a, b) => (b.budget_max as number) - (a.budget_max as number));
      return reply(`${cs.map((c) => `${c.name}: ${fullMoney(c.budget_max as number)}`).join("\n")}\n${sorted[0].name} is ${fullMoney((sorted[0].budget_max as number) - (sorted[sorted.length - 1].budget_max as number))} higher than ${sorted[sorted.length - 1].name}.`, [], "chat_simple");
    }
    case "unknown_fact":
    default:
      return reply("I don't have that figure on file and I won't guess. HOA and condo fees vary a lot by building and community, and property tax rates by county. They come from the county and the association: check the listing sheet or MLS record, tell me the amount, and I'll save it on the home and use it in payment estimates.", [], "chat_simple");
  }
}
