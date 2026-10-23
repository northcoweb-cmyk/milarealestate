/**
 * Number questions answered from the numbers themselves, never from a list and never from the AI service: mortgage payment,
 * seller net sheet, net price with a credit, price-reduction percentage, commission, affordability, and questions about
 * budgets already saved on contacts ("which buyers are under $600k", "compare Desmond's budget to Corinne's").
 * Every answer says which assumptions it used. Nothing is saved.
 */
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

export type CalcKind = "recap" | "payment" | "net_sheet" | "net_price" | "reduction" | "commission" | "affordable" | "budget_filter" | "budget_compare" | "unknown_fact" | "cash_to_close";

export function calcKind(text: string): CalcKind | null {
  const t = text.toLowerCase();
  if (/^\s*(?:add|new|create|schedule|book|remind|draft|write|email|text)\b/.test(t)) return null;
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
      let price = nums[0];
      let label = "";
      if (!price) { const p = await resolveProperty(ctx, text, true).catch(() => null); if (p?.list_price) { price = p.list_price; label = ` for ${p.address}`; } }
      if (!price) return reply("What's the sale price? Give me the price and the commission, like “net sheet 479k at 5.5%”.", [], "chat_simple");
      const pct = pcts[0] ?? 5.5;
      const comm = Math.round(price * pct / 100);
      const ccm = /\$\s?(\d[\d,]*(?:\.\d+)?\s?k?)\s*(?:in |of )?closing(?: costs)?|closing(?: costs)?(?: of| at|:)?\s*\$\s?(\d[\d,]*(?:\.\d+)?\s?k?)/i.exec(text);
      const given = ccm ? parseMoney(`$${(ccm[1] ?? ccm[2]).replace(/\s/g, "")}`).max : null;
      const closing = given ?? Math.round(price * 0.015); // closing costs as given, else a rough 1.5% for seller-side costs and transfer taxes
      return reply(`Seller net sheet${label} at ${fullMoney(price)}:\n• Gross sale price: ${fullMoney(price)}\n• Commission (${pct}%${pcts.length ? "" : ", assumed"}): −${fullMoney(comm)}\n• Closing costs${given ? " (as you gave them)" : " and transfer taxes (about 1.5%, estimated)"}: −${fullMoney(closing)}\n• ${given ? "Net to the seller before mortgage payoff" : "Estimated net before mortgage payoff"}: ${fullMoney(price - comm - closing)}\nSubtract the loan payoff and any credits for the real number. Tell me the commission or payoff and I'll rerun it.`, [], "chat_simple");
    }
    case "payment":
    case "affordable": {
      let price = nums[0];
      let label = "";
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
      const dp = down ?? 20;
      const loan = price * (1 - dp / 100);
      const pi = monthlyPI(loan, rateUsed, term);
      const tax = (price * 0.0094) / 12, ins = (price * 0.0035) / 12;
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
