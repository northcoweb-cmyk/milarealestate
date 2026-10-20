/**
 * Writes the message itself from what the agent said, with no model: the right channel, the right recipient, the specifics they gave
 * (dates, prices, addresses, the ask), never the instruction pasted back, never a facts-free "Following up" template, and never a
 * claim that something happened (a visit, a preference) that nobody said. A model, when one is available, may polish this; it is
 * also the answer when none is.
 */

export type Purpose = "counter" | "offer" | "welcome" | "repair" | "appraisal" | "confirm" | "seller_update" | "plan" | "visit" | "thanks" | "price_change" | "generic";
export type Channel = "email" | "text";

export interface Spec {
  channel: Channel;
  purpose: Purpose;
  /** what to say, after the "draft an email to X" wrapper is removed */
  content: string;
  address: string | null;
  recipientFirst: string;
  /** "Hollis and Mae" when the agent wrote the greeting themselves */
  greetingNames?: string | null;
  me: string;
  signature?: string;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const sentence = (s: string) => { const t = s.trim().replace(/\s+/g, " ").replace(/[,;:\s]+$/, ""); if (!t) return ""; return /[.!?]$/.test(t) ? cap(t) : `${cap(t)}.`; };
/** a clause of the request, spoken to the person: "he"/"she"/"her" → "you"/"your" */
/** weekdays, months and clock times written the way a person would send them */
const tidy = (s: string) => s.replace(/\bin ([a-z]{4,})([.!?]?)$/, (_m, w, p) => `in ${cap(w)}${p}`).replace(/\b(mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(day)?\b/gi, (m) => cap(m.toLowerCase())).replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, (m) => cap(m.toLowerCase())).replace(/\b(\d{1,2})(?::(\d{2}))?\s?([ap])\.?m\.?\b/gi, (_m, h, mi, ap) => `${h}${mi ? `:${mi}` : ""} ${ap.toUpperCase()}M`);
const toYou = (s: string) => tidy( s.replace(/\b(?:he|she|they)\b(?=\s+(?:is|are|was|were|has|have|had|will|can|should|need|needs|wants?)\b)/gi, "you").replace(/\b(?:his|her|their)\b/gi, "your").replace(/\b(?:him|them)\b/gi, "you").replace(/\byou (?:is|has|wants|needs)\b/gi, (m) => ({ "you is": "you are", "you has": "you have", "you wants": "you want", "you needs": "you need" } as Record<string, string>)[m.toLowerCase()] ?? m));
/** cut at a word, never mid-word */
export const atWord = (s: string, n: number) => { const t = s.replace(/\s+/g, " ").trim(); if (t.length <= n) return t; const c = t.slice(0, n); return `${c.slice(0, Math.max(c.lastIndexOf(" "), 12)).replace(/[,;:\s]+$/, "")}…`; };

/** What this message is for. Order matters: the most specific purposes first. */
export function purposeOf(t: string): Purpose {
  const s = t.toLowerCase();
  if (/\bcounter(?:ing|ed)?\b/.test(s)) return "counter";
  if (/\brepair|roof\b|leak|addendum|credit for\b/.test(s)) return "repair";
  if (/\bappraisal|appraised\b/.test(s)) return "appraisal";
  if (/\bwelcome\b/.test(s)) return "welcome";
  if (/\bprice (?:improvement|reduction|drop|change)|reduced? the price|lower(?:ing)? the price/.test(s)) return "price_change";
  if (/\boffer\b/.test(s)) return "offer";
  if (/\bconfirm\w*\b/.test(s)) return "confirm";
  if (/\bseller update|update on (?:your|the) listing|(?:sitting|on the market)\b.{0,20}\bdays\b/.test(s)) return "seller_update";
  if (/\bexplain\w*|walks? (?:them|you|her|him) through|launch plan|the plan\b/.test(s)) return "plan";
  if (/\b(?:thank|thanks)\b/.test(s)) return "thanks";
  if (/\b(?:open house|showing|tour)\b/.test(s)) return "visit";
  return "generic";
}

/** The channel the words ask for; a saved "text only" preference decides when the words don't say. */
export function channelOf(request: string, preferences: string[]): Channel {
  const s = request.toLowerCase();
  if (/^\s*(?:(?:please|pls|can you|could you|hey|mila)[,\s]+)*(?:text|txt|sms)\b/.test(s) || /\b(?:a|an|the|short|quick)\s+(?:text|txt|sms)(?:\s+message)?\b/.test(s) || /\btext message\b|\bsms\b/.test(s)) return "text";
  if (/\be-?mail\b/.test(s)) return "email";
  return preferences.some((p) => /\btext(?:s|ing)?\s+only\b|\bby text\b|\bprefers? (?:a )?text\b/i.test(p)) ? "text" : "email";
}

/** Everything after the "draft an email to X" wrapper: the content the agent wants said. */
export function contentOf(request: string, recipientWords: string[] = []): string {
  let t = request.replace(/\s+/g, " ").trim();
  t = t.replace(/^\s*(?:(?:yah|yeah|yep|yes|ok|okay|sure|and|then|now|please|pls|can you|could you|go ahead|hey|mila)[,.!\s]+)+/i, "");
  t = t.replace(/^(?:draft|write|compose|prepare|make|send|text|txt|email|e-mail|message|sms)\b\s*(?:me\s+)?(?:(?:a|an|the|that|this|another|new|short|quick|brief)\s+)*(?:(?:counter\s*offer|counter|welcome|follow.?up|thank.?you|seller update|repair request|update|confirmation|reminder|new)\s+)*(?:e-?mail|text(?:\s+message)?|txt|sms|message|note|reply)?\b\s*/i, "");
  t = t.replace(/^(?:to|for)\s+/i, "");
  // drop the recipient: a typed address, an "x, the listing agent for …" apposition, then names
  t = t.replace(/^[\w.+-]+@[\w-]+\.[\w.-]+\s*/, "");
  for (const w of recipientWords.filter(Boolean).sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(`^${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:['’]s)?\\b[,.]?\\s*`, "i"), "");
  t = t.replace(/^(?:the\s+)?(?:listing agent|buyer'?s?\s+agent|sellers?|buyers?)(?:\s+(?:for|of|on)\s+[^,.]{3,60})?[,.]?\s*/i, "");
  t = t.replace(/^(?:(?:for|about|on|at|regarding)\s+)?[\d]{1,6}\s+[A-Za-z0-9.' ]{3,40}?\s(?:street|st|road|rd|avenue|ave|lane|ln|court|ct|drive|dr|way|boulevard|blvd|place|pl|circle|cir|terrace)\b[.,]?\s*/i, "");
  t = t.replace(/\b(?:draft only|just a draft|don'?t send(?: it)?|do not send(?: it)?)\b[.,]?/gi, "");
  t = t.replace(/,?\s*(?:his|her|their)\s+e-?mail(?:\s+address)?\s+is\s+\S+/gi, "").replace(/\b(?:that\s+)?(?:starts?|begins?|opens?)\s+(?:with\s+)?["“]?(?:Hi|Hello|Dear|Hey)\s+[\p{L}'’-]+(?:\s+(?:and|&)\s+[\p{L}'’-]+)?\s*(?:and\s+)?/giu, "");
  t = t.replace(/^(?:,|:|-)\s*/, "").trim();
  return t;
}

const cleanTopic = (c: string) => c.replace(/^(?:letting\s+\w+\s+know|let\s+\w+\s+know|to say|saying|that|about|regarding|re:?|explaining|to explain|asking(?:\s+for)?|to ask(?:\s+for)?|to tell\s+\w+|telling\s+\w+|mention(?:ing)?|confirming|to confirm|that starts[^,]*?(?:and|,)\s*(?:walks?|goes)\s+\w+\s+through)\s+/i, "").replace(/^(?:the\s+)?/, "").trim();

/** Subject line: what it is about, and the address, cut at a word. */
export function subjectOf(spec: Spec): string {
  const a = spec.address;
  switch (spec.purpose) {
    case "counter": return `Counter offer${a ? `: ${a}` : ""}`;
    case "offer": return `Offer${a ? `: ${a}` : ""}`;
    case "welcome": return "Welcome";
    case "repair": return `Repair request${a ? `: ${a}` : ""}`;
    case "appraisal": return `Appraisal and price${a ? `: ${a}` : ""}`;
    case "confirm": return `Confirming our ${/\bshowing|tour\b/i.test(spec.content) ? "showing" : /\binspection\b/i.test(spec.content) ? "inspection" : "appointment"}`;
    case "seller_update": return `Update on ${a ?? "your listing"}`;
    case "plan": return `The plan${a ? ` for ${a}` : ""}`;
    case "price_change": return `Price update${a ? `: ${a}` : ""}`;
    case "visit": return `${/open house/i.test(spec.content) ? "Open house" : "Showing"}${a ? `: ${a}` : ""}`;
    case "thanks": return "Thank you";
    default: { const t = cleanTopic(spec.content); return t ? `About ${atWord(t.replace(/^(?:the|a|an)\s+/i, "").replace(/[.!?]+$/, ""), 46)}` : `Following up${a ? `: ${a}` : ""}`; }
  }
}

function amounts(t: string): number[] { const out: number[] = []; for (const m of t.matchAll(/\$?\s?(\d[\d,.]*)\s?(k|m)?\b/gi)) { const raw = m[0]; if (!/\$|[km]\b/i.test(raw)) continue; const n = parseFloat(m[1].replace(/,/g, "")); if (!Number.isFinite(n)) continue; const v = /k/i.test(m[2] ?? "") ? n * 1000 : /m/i.test(m[2] ?? "") ? n * 1_000_000 : n; if (v >= 1000) out.push(Math.round(v)); } return out; }

/** The body, in the agent's voice, from the specifics they gave. No pasted instruction, no invented facts. */
export function bodyOf(spec: Spec): string {
  const hi = spec.channel === "text" ? `Hi ${spec.greetingNames ?? spec.recipientFirst}!` : `Hi ${(spec.greetingNames ?? spec.recipientFirst) || "there"},`;
  const c = spec.content;
  const a = spec.address;
  const nums = amounts(c);
  const rest = cleanTopic(c);
  const parts: string[] = [];
  switch (spec.purpose) {
    case "counter": {
      const credit = /\$?\s?(\d[\d,.]*\s?[km]?)\s+(?:seller\s+)?credit|credit of\s+\$?\s?(\d[\d,.]*\s?[km]?)/i.exec(c);
      const creditN = credit ? amounts(`$${credit[1] ?? credit[2]}`)[0] : null;
      const counter = nums.find((n) => n !== creditN) ?? nums[0];
      parts.push(`Thank you for the offer${a ? ` on ${a}` : ""}.`, `We'd like to counter${counter ? ` at ${money(counter)}` : ""}${creditN ? `, and we're able to include the ${money(creditN)} seller credit` : ""}.`, "Please let me know if that works for your client. I'm happy to talk it through.");
      break;
    }
    case "welcome": parts.push("Welcome, and thank you for choosing to work with me.", `I'm looking forward to helping you${a ? ` with ${a}` : ""}.`, "I'll be your main point of contact, so reach out any time with questions.", rest && !/^(?:email|his email|her email)\b/i.test(rest) && rest.length > 12 && !/@/.test(rest) ? sentence(toYou(rest)) : ""); break;
    case "repair": {
      const ask = /(?:asking(?:\s+for)?|requesting|to request)\s+(.+)$/i.exec(c)?.[1] ?? rest;
      parts.push(`I'm writing about ${a ?? "the property"}.`, ask ? `We're asking for ${ask.replace(/[.!\s]+$/, "")}.` : "The inspection found items we need to resolve.", "Could you let me know how the sellers would like to proceed?");
      break;
    }
    case "appraisal": {
      const [low, high] = nums.length >= 2 ? [Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])] : [null, null];
      parts.push(`I'm reaching out about ${a ?? "the contract"}.`, `The appraisal came in lower than the contract price${low && high ? ` (${money(low)} against ${money(high)})` : ""}.`, `I'd like to discuss renegotiating the price${/middle|split/i.test(c) ? ", and to ask whether the seller would be open to meeting in the middle" : ""}.`);
      break;
    }
    case "confirm": parts.push(`I'm confirming ${toYou(rest).replace(/[.!\s]+$/, "")}.`, "Please let me know if anything needs to change."); break;
    case "seller_update": { const fact = (rest || c).replace(/^(?:the|this)\s+listing\b/i, "your listing").replace(/[.!\s]+$/, ""); parts.push(a ? `Quick update on ${a}: ${/^your listing/i.test(fact) ? fact.replace(/^your listing/i, "it") : fact}.` : `Quick update: ${fact}.`, "I'd like to talk through next steps, including pricing and marketing. When is a good time?"); break; }
    case "plan": {
      const through = /\bthrough\s+(.+)$/i.exec(rest)?.[1];
      const clause = through ? "" : rest.replace(/^(?:the\s+)?plan\s*(?:to\s+)?/i, "");
      parts.push(through ? `I wanted to walk you through ${through.replace(/[.!\s]+$/, "")}.` : `I wanted to walk you through the plan${a ? ` for ${a}` : ""}${clause ? `: we ${clause.replace(/[.!\s]+$/, "")}` : ""}.`, "I'll follow up with the specifics, and I'm happy to talk it through whenever suits you.");
      break;
    }
    case "price_change": parts.push(`I wanted to let you know about a price update${a ? ` on ${a}` : ""}${nums.length ? `: ${nums.length > 1 ? `from ${money(nums[0])} to ${money(nums[1])}` : `now ${money(nums[0])}`}` : ""}.`, "Let me know if you'd like to talk about what it means for you."); break;
    case "offer": parts.push(`I wanted to update you on the offer${a ? ` on ${a}` : ""}${nums.length ? `: ${money(nums[0])}${nums[1] ? `, with room to go up to ${money(nums[1])}` : ""}` : ""}.`, rest && nums.length === 0 ? sentence(toYou(rest)) : "", "Let me know if you have any questions."); break;
    case "visit": parts.push(sentence(toYou(rest || c)), "Let me know if you have any questions."); break;
    case "thanks": parts.push(sentence(toYou(rest || "thank you")), "It was great working with you."); break;
    default: parts.push(rest ? `I wanted to follow up about ${atWord(toYou(rest).replace(/[.!?]+$/, ""), 160)}.` : `I wanted to follow up${a ? ` about ${a}` : ""}.`, "Let me know a good time to talk.");
  }
  const core = parts.filter(Boolean).join(" ");
  if (spec.channel === "text") return `${hi} ${core.replace(/\s+/g, " ").replace(/Please let me know if/g, "Let me know if")} – ${spec.me}`.replace(/(?:Let me know if that works for your client\.)\s*I'm happy to talk it through\./, "Let me know if that works.");
  return `${hi}\n\n${parts.filter(Boolean).join("\n\n")}\n\nBest,\n${spec.me}`;
}
