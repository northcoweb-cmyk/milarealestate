import { contactForPronoun } from "../gender";
import { askWhichPerson, ambiguousFirstName } from "./entity";
import { warmText } from "../warm";
import { addDays, fmtDay, fmtShortDate, fmtTime, partsIn, startOfDay, zonedToUtc } from "../../time";
import type { Block, BriefItem, BriefSection, CalendarEvent, Contact, Property, Task } from "../../types";
import type { Ctx } from "../context";
import { fullMoney, plural } from "../context";
import { persistState } from "../conversation";
import { extractListingFacts } from "../listing";
import { learnDetailed } from "../learn";
import { listMemories, saveMemory } from "../memory";
import { capitalisedNames, parseAddress, parseDate, parseMoney, parseTime } from "../nlu";
import type { Intent } from "../intents";
import { locationGate } from "./location";
import { TOOLS, invoke, logContactEvent } from "../tools";
import { askBack } from "./ask";
import { sharePhotosBlock, wantsPhotos } from "./photos";
import { mentionedContacts } from "./contacts";
import { upcomingWith } from "./lifecycle";
import { type HandlerOut, reply } from "./types";
import { firstNameOf } from "../../names";

const TX_NOTE = "Transaction milestone";
const fullDate = (d: Date | string, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
const when = (d: Date | string, tz: string) => `${fmtDay(d, tz).slice(0, 3)}, ${fmtShortDate(d, tz)} · ${fmtTime(d, tz)}`;
const at = (base: Date, tz: string, h: number, mi = 0) => { const p = partsIn(base, tz); return zonedToUtc(p.y, p.m, p.d, h, mi, tz); };

/** The property an agent is talking about: the address they gave, the one they just mentioned, or one we can create in their market. */
async function propertyFor(ctx: Ctx, text: string, intent: Intent): Promise<{ prop: Property } | { out: HandlerOut } | null> {
  const street = parseAddress(text);
  if (!street) { const p = ctx.state.last_property_id ? await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id) : null; return p ? { prop: p } : null; }
  const gate = await locationGate(ctx, intent, text, street);
  if (!gate.ok) return { out: gate.out };
  const place = gate.found.place;
  const f = extractListingFacts(text);
  const made = (await TOOLS.create_property.run(ctx, { address: street, city: place.city, state: place.state, zip: place.zip, county: place.county, list_price: undefined, beds: f.beds, baths: f.baths, sqft: f.sqft })) as any;
  return { prop: made.data.property as Property };
}

// ------------------------------------------------------------------ transaction coordinator

const MILESTONES = [
  { key: "emd", label: "Earnest money due", re: /\b(?:earnest(?: money)?|emd|deposit)\b/i, def: 3, h: 9 },
  { key: "inspection", label: "Inspection", re: /\binspection\b/i, def: 10, h: 9 },
  { key: "appraisal", label: "Appraisal", re: /\bappraisal\b/i, def: 21, h: 9 },
  { key: "financing", label: "Financing contingency", re: /\b(?:financing|loan|mortgage|lender|commitment)(?: contingency| commitment| approval| deadline)?\b/i, def: 25, h: 9 },
  { key: "walkthrough", label: "Final walkthrough", re: /\b(?:final )?walk.?through\b/i, def: 0, h: 16 },
  { key: "closing", label: "Closing", re: /\b(?:clos(?:ing|e)(?!\s+(?:cost|costs|credit|credits))|settlement|settle)\b/i, def: 0, h: 10 },
] as const;

/** The date written right after a keyword ("inspection in 7 days", "appraisal by the 28th", "closing November 20"). */
function dateAfter(text: string, re: RegExp, all: RegExp[], now: Date, tz: string) {
  const m = re.exec(text);
  if (!m) return null;
  let rest = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 48);
  for (const o of all) { if (o === re) continue; const n = o.exec(rest); if (n) rest = rest.slice(0, n.index); }
  rest = rest.split(/[;,]|\band\b/i)[0];
  // "due in 3 business days": counted on weekdays only
  const bd = /\bin\s+(\d{1,2})\s+business\s+days?\b/i.exec(rest);
  if (bd) { let d = now; for (let n = Number(bd[1]); n > 0;) { d = addDays(d, 1, tz); if (![0, 6].includes(partsIn(d, tz).dow)) n--; } const p = partsIn(d, tz); return { y: p.y, m: p.m, d: p.d, text: bd[0], relative: true } as ReturnType<typeof parseDate>; }
  return parseDate(rest, now, tz);
}

const partsOf = (d: Date, tz: string) => { const q = partsIn(d, tz); return { y: q.y, m: q.m, d: q.d }; };
const todayKey0 = (q: { y: number; m: number; d: number }) => q.y * 10000 + q.m * 100 + q.d;
export async function transactionHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const found0 = await propertyFor(ctx, text, "transaction");
  if (found0 && "out" in found0) return found0.out;
  const prop = found0?.prop ?? null;
  if (!prop) return askBack(ctx, "transaction", text, "address", `${/\b(roof|leak|damage|problem|issue|repair|fell through|fall through|appraised low|low appraisal|failed|terminated|backed out|cancel)/i.test(text) ? "I'm sorry, that's a hard one." : "Congrats!"} Which property is it? Give me the address and the closing date and I'll build the whole timeline.`);
  ctx.state.last_property_id = prop.id;
  const all = MILESTONES.map((m) => m.re);
  const found: Record<string, ReturnType<typeof parseDate>> = {};
  for (const m of MILESTONES) found[m.key] = dateAfter(text, m.re, all, ctx.now, ctx.tz);
  if (!found.closing) { // answering "what's the closing date?" gives just a date: use the one that no other milestone claimed
    let rest = text;
    for (const m of MILESTONES) { const x = m.re.exec(rest); if (x) rest = rest.slice(0, x.index) + " " + rest.slice(x.index + x[0].length + 48); }
    found.closing = parseDate(rest.replace(/\b\d{1,6}\s+[A-Za-z.' ]{2,30}?\b(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|way|blvd|boulevard|place|pl|terrace|circle|trail)\b/gi, " "), ctx.now, ctx.tz);
  }
  // an accepted offer with no closing date yet: the acceptance and the earnest-money date are saved now, then the closing date is asked once
  const acceptedOn = /\baccepted\b/i.test(text);
  if (acceptedOn && found.closing && todayKey0(found.closing) <= todayKey0(partsOf(ctx.now, ctx.tz)) + 1) found.closing = null;
  if (!found.closing && acceptedOn) {
    const price = extractListingFacts(text).list_price ?? (/\$\s?(\d[\d,.]*\s?[km]?)/i.exec(text) ? parseMoney(text).max : null);
    await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: "Transaction", value: `Under contract${price ? ` · accepted at ${fullMoney(price)}` : ""} · offer accepted ${fullDate(ctx.now, ctx.tz)}`, source: "user_stated" });
    const emd = found.emd;
    if (emd) await TOOLS.create_task.run(ctx, { kind: "task", title: `Earnest money due — ${prop.address}`, subtitle: TX_NOTE, property_id: prop.id, due_at: zonedToUtc(emd.y, emd.m, emd.d, 9, 0, ctx.tz).toISOString(), internal: true });
    ctx.state.last_property_id = prop.id; await persistState(ctx);
    return askBack(ctx, "transaction", text, "date", `Got it: the offer on ${prop.address} was accepted${price ? ` at ${fullMoney(price)}` : ""}${emd ? `, and earnest money is due ${fmtDay(zonedToUtc(emd.y, emd.m, emd.d, 9, 0, ctx.tz), ctx.tz)}, ${fmtShortDate(zonedToUtc(emd.y, emd.m, emd.d, 9, 0, ctx.tz), ctx.tz)}` : ""}. What's the closing date? I'll set up the inspection, appraisal and financing deadlines around it.`);
  }
  if (!found.closing) return askBack(ctx, "transaction", text, "date", `What's the closing date for ${prop.address}? I'll set up the inspection, appraisal and financing deadlines around it.`);
  // the time the agent gave for the closing ("settlement Friday November 20 at 10:00 AM"), else 10 AM
  const closeRe = MILESTONES.find((m) => m.key === "closing")!.re;
  const cm = closeRe.exec(text);
  const closeTimeRaw = cm ? text.slice(cm.index, cm.index + 90).split(/[.;]|,\s*(?=(?:inspection|appraisal|financing)\b)/i)[0] : "";
  const closeTime = parseTime(closeTimeRaw);
  const closePlace = /\b(?:at|in)\s+(?:the\s+)?([A-Za-z][A-Za-z' .-]{2,40}?)\s*(?:[.;]|$)/.exec(closeTimeRaw.replace(/\bat\s+\d[^ ]*\s*(?:[ap]\.?m\.?)?/i, ""))?.[1]?.trim() ?? null;
  const closeAt = zonedToUtc(found.closing.y, found.closing.m, found.closing.d, closeTime?.start.h ?? 10, closeTime?.start.mi ?? 0, ctx.tz);
  const todayKey = (d: Date) => { const q = partsIn(d, ctx.tz); return q.y * 10000 + q.m * 100 + q.d; };
  if (todayKey(closeAt) < todayKey(ctx.now)) return askBack(ctx, "transaction", text, "date", `${fmtDay(closeAt, ctx.tz)} has already passed. What's the real closing date?`);
  const offerPrice = (() => { const m = /\b(?:at|for)\s+\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)?\b/i.exec(text); if (!m) return null; const n = parseFloat(m[1].replace(/,/g, "")) * (/k/i.test(m[2] ?? "") ? 1000 : /m/i.test(m[2] ?? "") ? 1_000_000 : 1); return n >= 20_000 ? Math.round(n) : null; })(); // "offer accepted at $610,000"
  ctx.steps.push("Building the transaction timeline");

  // start clean so telling Mila again (e.g. the closing moved) replaces the timeline instead of doubling it
  await ctx.store.removeWhere("calendar_events", ctx.userId, (r) => (r as CalendarEvent).property_id === prop.id && (r as CalendarEvent).notes === TX_NOTE);
  await ctx.store.removeWhere("tasks", ctx.userId, (r) => (r as Task).property_id === prop.id && (r as Task).subtitle?.startsWith(TX_NOTE) === true && (r as Task).status === "open");

  const rows: { label: string; start: Date; estimated: boolean; key: string; kind: CalendarEvent["kind"] }[] = [];
  for (const m of MILESTONES) {
    let d = found[m.key], estimated = false, start: Date;
    if (m.key === "closing") start = closeAt;
    else if (m.key === "walkthrough") { start = at(addDays(closeAt, -1, ctx.tz), ctx.tz, m.h); estimated = !d; if (d) start = zonedToUtc(d.y, d.m, d.d, m.h, 0, ctx.tz); }
    else if (d) start = zonedToUtc(d.y, d.m, d.d, m.h, 0, ctx.tz);
    else { estimated = true; start = at(addDays(ctx.now, m.def, ctx.tz), ctx.tz, m.h); if (start.getTime() > addDays(closeAt, -2, ctx.tz).getTime()) continue; } // a typical deadline that would land after closing makes no sense
    d = d ?? null;
    if (start.getTime() < ctx.now.getTime()) continue;
    rows.push({ label: m.label, start, estimated, key: m.key, kind: m.key === "closing" ? "closing" : m.key === "inspection" || m.key === "appraisal" || m.key === "walkthrough" ? "meeting" : "other" });
  }
  rows.sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const r of rows) {
    await invoke(ctx, "create_calendar_event", { title: `${r.label} — ${prop.address}`, kind: r.kind, start_at: r.start.toISOString(), end_at: new Date(r.start.getTime() + (r.key === "closing" ? 2 : 1) * 3_600_000).toISOString(), location: r.key === "closing" && closePlace ? `${closePlace} (${prop.address})` : prop.address, property_id: prop.id, notes: TX_NOTE, ignoreConflicts: true });
    await TOOLS.create_task.run(ctx, { kind: "task", title: `${r.label} — ${prop.address}`, subtitle: `${TX_NOTE}${r.estimated ? " · typical timing, confirm with your contract" : ""}`, property_id: prop.id, due_at: r.start.toISOString(), internal: true });
  }
  await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: "Transaction", value: `Under contract${offerPrice ? ` · accepted at ${fullMoney(offerPrice)}` : ""} · closing ${fullDate(closeAt, ctx.tz)}`, source: "user_stated" });
  await persistState(ctx);

  const weekend = rows.filter((r) => [0, 6].includes(partsIn(r.start, ctx.tz).dow));
  const lines = rows.map((r) => `• ${when(r.start, ctx.tz)} — ${r.label}${r.estimated ? " (typical — confirm with your contract)" : ""}`);
  const daysLeft = Math.round((closeAt.getTime() - ctx.now.getTime()) / 86_400_000);
  const notes = [`${daysLeft} days to close.`, ...(weekend.length ? [`Heads up: ${weekend.map((w) => w.label.toLowerCase()).join(" and ")} lands on a weekend — check whether your contract rolls it to the next business day.`] : [])];
  return reply(`Congratulations! I built the timeline for ${prop.address} and put every deadline on your calendar and in your tasks:\n${lines.join("\n")}\n\n${notes.join(" ")}`, [{
    type: "choice", title: "Keep everyone in the loop",
    buttons: [
      { label: "Email the buyer/seller a timeline", style: "secondary", action: { type: "prompt", text: `Draft an email to my client about the timeline for ${prop.address}` } },
      { label: "See calendar", style: "secondary", href: "/calendar" },
      { label: "Open property", style: "quiet", href: `/properties/${prop.id}` },
    ],
  }], "chat_complex");
}

// ------------------------------------------------------------------ closed deal

export async function closedDealHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const found1 = await propertyFor(ctx, text, "closed_deal");
  if (found1 && "out" in found1) return found1.out;
  const prop = found1?.prop ?? null;
  if (!prop) return askBack(ctx, "closed_deal", text, "address", "Congratulations! Which property closed?");
  ctx.state.last_property_id = prop.id;
  const price = extractListingFacts(text.replace(/\bclosed on\b/i, "")).list_price;
  const who = /\b(?:buyers?|sellers?|clients?)\s+(?:were|are|was|is)\s+(?:the\s+)?([A-Z][\p{L}'’.-]+(?:\s+(?:and|&)\s+[A-Z][\p{L}'’.-]+)?(?:\s+[A-Z][\p{L}'’.-]+)?)/u.exec(text)?.[1];
  const closedOn = ctx.now;
  await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: "Transaction", value: `Sold${price ? ` ${fullMoney(price)}` : ""} · closed ${fullDate(closedOn, ctx.tz)}`, source: "user_stated" });
  // finish what the transaction timeline had left open
  const open = (await ctx.store.list("tasks", ctx.userId)).filter((t) => t.property_id === prop.id && t.status === "open" && t.subtitle?.startsWith(TX_NOTE));
  for (const t of open) await TOOLS.complete_task.run(ctx, { id: t.id });
  let client: Contact | null = null;
  if (who) {
    const name = /^[A-Z][a-z]+s$/.test(who) ? `The ${who}` : who;
    const r = (await TOOLS.create_contact.run(ctx, { name, type: "past_client", status: "closed", source: "Closed deal", notes: `Closed on ${prop.address}${price ? ` for ${fullMoney(price)}` : ""}` })) as any;
    if (r.ok) { client = r.data.contact; if (r.data.existing) await TOOLS.update_contact.run(ctx, { id: client!.id, patch: { type: "past_client", status: "closed" }, eventTitle: `Closed on ${prop.address}`, eventKind: "note" }); }
  }
  const plan: [string, number][] = [["Send a thank-you note / closing gift", 1], ["Ask for a review or testimonial", 7], ["30-day check-in: how's the new home?", 30], ["Home-anniversary note", 365]];
  for (const [title, days] of plan) await TOOLS.create_task.run(ctx, { kind: "follow_up", title: `${title}${client ? ` — ${client.name}` : ` — ${prop.address}`}`, contact_id: client?.id, property_id: prop.id, due_at: new Date(ctx.now.getTime() + days * 86_400_000).toISOString(), internal: true });
  return reply(`Congratulations on closing ${prop.address}${price ? ` at ${fullMoney(price)}` : ""}! I marked it sold${open.length ? `, cleared ${plural(open.length, "open deadline")}` : ""}${client ? `, and saved ${client.name} as a past client` : ""}. I also queued the follow-ups that turn closings into referrals: a thank-you tomorrow, a review request in a week, a 30-day check-in, and a home-anniversary note.`, [{
    type: "choice", title: "Spread the word",
    buttons: [
      { label: "Make a Just Sold post", style: "primary", action: { type: "prompt", text: `Create a just sold post for ${prop.address}` } },
      { label: "Draft thank-you email", style: "secondary", action: { type: "prompt", text: `Draft a thank-you email to ${client?.name ?? "my clients"} for closing on ${prop.address}` } },
      { label: "See follow-ups", style: "quiet", href: "/tasks" },
    ],
  }], "chat_complex");
}

// ------------------------------------------------------------------ calls, texts and meetings

const VERB = /\b(called|phoned|texted|emailed|messaged|reached out|stopped by|came by|replied|responded|dm'?d|met with|spoke with|talked to|talked with|met)\b/i;
export async function logInteractionHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const known = await mentionedContacts(ctx, text);
  const amb = ambiguousFirstName(text, known); if (amb) return askWhichPerson(text, amb);
  let c: Contact | null = known[0] ?? null;
  let added = false;
  if (!c) {
    const name = capitalisedNames(text).find((n) => n.length > 2);
    if (!name) return askBack(ctx, "log_interaction", text, "name", "Who was it? I'll log it and set the follow-up.");
    const r = (await TOOLS.create_contact.run(ctx, { name, type: "lead", status: "new", source: "Logged from chat" })) as any;
    if (!r.ok) return reply("I couldn't save that contact.");
    c = r.data.contact as Contact; added = true;
  }
  const first = firstNameOf(c.name);
  const verb = (VERB.exec(text)?.[1] ?? "call").toLowerCase();
  const kind = /text|dm/.test(verb) ? "text" : /email/.test(verb) ? "email" : /met|stopped|came/.test(verb) ? "meeting" : "call";
  await logContactEvent(ctx, c.id, kind, `${kind[0].toUpperCase()}${kind.slice(1)} logged`, text.slice(0, 400));
  await ctx.store.update("contacts", ctx.userId, c.id, { last_contact_at: ctx.now.toISOString() } as never);
  // "…she's pre-approved up to 650k, wants 3 beds": a sentence that starts with she/he/they is about the person this call was with
  const named = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.replace(/^(she|he|they)(?:('s)|('re))?\b/i, (_m, _p, s1) => (s1 ? `${first} is` : `${first} is`))).join(" ");
  const learned = (await learnDetailed(ctx, named)).filter((i) => i.contact?.id === c!.id);
  ctx.state.last_contact_ids = [c.id];

  // the follow-up: what the agent promised, or what the client asked for — due tomorrow morning
  const promise = /\b(?:i(?:'ll| will)|let me|need to|going to)\s+([^.!?\n]{4,80})/i.exec(text)?.[1];
  const ask = /\b(?:wants?|asked for|looking for|needs?|would like)\s+([^.!?\n]{4,80})/i.exec(text)?.[1];
  const tomorrow9 = at(addDays(ctx.now, 1, ctx.tz), ctx.tz, 9);
  const title = promise ? `${first}: ${promise.replace(/\s+/g, " ")}` : ask ? `Follow up with ${first}: ${ask}` : `Follow up with ${first}`;
  await TOOLS.create_task.run(ctx, { kind: "follow_up", title: title.slice(0, 120), contact_id: c.id, due_at: tomorrow9.toISOString(), internal: true });

  const showing = /\b(see|tour|view|look at|visit)\b.*\b(houses?|homes?|properties|listings?|place)\b|\bshowings?\b/i.test(text);
  const blocks: Block[] = [{ type: "choice", title: `Next for ${first}`, buttons: [
    { label: `Text ${first}`, style: "primary", action: { type: "prompt", text: `Text ${c.name} that I'm following up` } },
    ...(showing ? [{ label: `Schedule showings for ${first}`, style: "secondary" as const, action: { type: "prompt", text: `Schedule a showing for ${c.name}` } }] : []),
    { label: "Find homes for them", style: "secondary", action: { type: "prompt", text: `Find homes for ${c.name}` } },
    { label: "Open profile", style: "quiet", href: `/contacts/${c.id}` },
  ] }];
  const sections: BriefSection[] = [
    { emoji: "📞", label: `${kind[0].toUpperCase()}${kind.slice(1)} with ${c.name}`, items: [{ text: text.replace(/\s+/g, " ").slice(0, 160), state: "done", button: { label: "Open profile", style: "quiet", href: `/contacts/${c.id}` } }] },
    ...(learned.length ? [{ emoji: "🧠", label: `Saved to ${first}'s profile`, items: learned.slice(0, 6).map((i) => ({ text: `${i.key}: ${i.value}`, state: "info" as const, button: { label: "Edit", style: "quiet" as const, href: `/contacts/${c!.id}` } })) }] : []),
    { emoji: "✅", label: "Follow-up set", items: [{ text: `${title} · tomorrow 9 AM`, state: "info", button: { label: "Change it", style: "quiet", href: "/tasks" } }] },
  ];
  blocks.unshift({ type: "listing_brief", kicker: "Logged", title: `${first}: call outcome`, done: 0, total: 0, sections });
  return reply(`Logged your ${kind} with ${c.name}${added ? " (new lead added)" : ""}. Here's what I saved.`, blocks, "chat_simple");
}

// ------------------------------------------------------------------ text message drafts (sent from the agent's own phone — one tap)

export async function draftTextHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  // "Text Dana I'm running late" / "text her that the showing moved": drop the verb first so it can't be mistaken for a name
  const stripped = text.replace(/^\s*(?:(?:please|pls|can you|could you|hey mila|mila)[,\s]+)*(?:(?:draft|write|compose|make|send|prepare)\s+(?:me\s+)?(?:an?|the)\s+(?:[\w-]+\s+){0,2}?(?:text|sms)(?:\s+message)?\s+(?:to|for)|text|txt|sms|message|msg|tell)\s+/i, "").trim();
  const pron = /^(her|him|them)\b\s*/i.exec(stripped);
  const lastId = ctx.state.last_contact_ids?.[0];
  const known = pron && lastId ? [await contactForPronoun(ctx, pron[1])].filter((x): x is Contact => !!x) : await mentionedContacts(ctx, stripped);
  const amb = pron ? null : ambiguousFirstName(stripped, known); if (amb) return askWhichPerson(text, amb);
  const c = known[0] ?? null;
  const name = c?.name ?? (pron ? "" : capitalisedNames(stripped).find((n) => !/^(Text|Message|Tell|Send)$/i.test(n)) ?? "");
  const first = firstNameOf(name);
  if (!first) return askBack(ctx, "draft_text", text, "name", "Who should I text?");
  const afterName = c ? stripped.replace(new RegExp(`^${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "") : stripped;
  let body = (pron ? stripped.slice(pron[0].length) : afterName.replace(new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+${(c ? c.name.split(/\s+/).slice(1).pop() ?? "" : "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") || "(?!)"})?\\s*`, "iu"), "")).replace(/^(?:that|saying|to say|:|-)\s*/i, "").trim().replace(/[.!\s]+$/, "");
  body = body.replace(/^follow-?\s?ups?\s+(?:from|after|on|about|to)\s+/i, "following up on ");
  body = body.replace(/^about\s+/i, "following up about ").replace(/^(?:thank(?:ing|s|ed)?|appreciat\w+)\s+(?:her|him|them|you)\s*(?=\S)/i, "thank you ").replace(/^thank you\s+(?!for\b)/i, "thank you for ");
  if (!body) body = "just checking in — do you have a few minutes to talk?";
  body = body.replace(/(?<!\b(?:send|give|show|get|bring|tell|email|text|owe|offer|ask)\s)\b(?:her|his|their)\s+(?=[a-z])/gi, "your ").replace(/\b(?:her|him|them)\b/gi, "you").replace(/\bhis\b|\bher\b|\btheir\b/gi, "your").replace(/^i'?ll\b/i, "I'll").replace(/^(\w)/, (m) => m.toLowerCase() === "i" ? "I" : m);
  // "Text him that I found 2 condos he'll like": the message is TO the person, so he/she/they becomes you
  body = body.replace(/\b(?:he|she|they)(?:'ll| will)\b/gi, "you'll").replace(/\b(?:he|she|they)(?:'s| is)\b/gi, "you're").replace(/\b(?:he|she|they)(?:'d| would)\b/gi, "you'd").replace(/\b(?:he|she|they)\b(?=\s+(?:can|could|should|wants?|needs?|likes?|loves?|will|would|may|might|has|have|had|was|were)\b)/gi, "you");
  // a bare weekday ("Tuesday at 4") carries its date, so the text can't be misread a week later
  { const wd = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b(?!,?\s+(?:oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)\w*\s+\d)/i.exec(body);
    if (wd) { const d = parseDate(wd[1], ctx.now, ctx.tz); if (d) body = body.replace(wd[0], `${wd[0]}, ${new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, month: "short", day: "numeric" }).format(zonedToUtc(d.y, d.m, d.d, 12, 0, ctx.tz))}`); } }
  // "text Maya to confirm tomorrow's showings": say which showings, when and where
  if (c && /\bconfirm\w*\b/i.test(body)) {
    const evs = (await upcomingWith(ctx, c)).filter((e) => e.kind === "showing" || /showing|tour/i.test(e.title)).slice(0, 4);
    if (evs.length) body = `confirming ${evs.length === 1 ? "our showing" : "our showings"}: ${evs.map((e) => `${fmtDay(e.start_at, ctx.tz)} at ${fmtTime(e.start_at, ctx.tz)}, ${(e.location || e.title.split("—").pop() || "").trim()}`).join("; ")}. Reply here if anything changes`;
  }
  const me = firstNameOf(ctx.profile.full_name);
  const msg = warmText(first, body, me);
  const phone = c?.phone?.replace(/[^\d+]/g, "") ?? "";
  const href = `sms:${phone}?&body=${encodeURIComponent(msg)}`;
  if (c) await logContactEvent(ctx, c.id, "text", "Text drafted", msg);
  ctx.state.last_contact_ids = c ? [c.id] : ctx.state.last_contact_ids;
  if (c) { ctx.state.pending_text = { contact_id: c.id, name: c.name, at: Date.now() }; await persistState(ctx); }
  return reply(`Here's the text to ${first}:\n\n“${msg}”\n\n${phone ? "Tap below and it opens in your Messages, ready to send." : `I don't have a number for ${first} yet — tap below to pick them in Messages.`} I don't send texts myself, so nothing goes out until you tap Send.`, [{
    type: "choice", title: `Text ${first}`,
    buttons: [{ label: `Open in Messages`, style: "primary", href }, ...(c ? [{ label: "Open profile", style: "quiet" as const, href: `/contacts/${c.id}` }] : [])],
  }, ...(wantsPhotos(text) ? await sharePhotosBlock(ctx, text, msg) : [])], "chat_simple");
}

// ------------------------------------------------------------------ week overview + pipeline

/** Which week the agent means: "week of Oct 26" and "next week" are Monday to Sunday of that week; "this week" is now to Sunday night; otherwise the next 7 days. */
function weekRange(ctx: Ctx, text: string): { from: number; to: number; label: string; future: boolean } {
  const day = partsIn(ctx.now, ctx.tz), sod = startOfDay(ctx.now, ctx.tz);
  const mondayOf = (d: Date) => { const dw = partsIn(d, ctx.tz).dow; return startOfDay(addDays(d, -((dw + 6) % 7), ctx.tz), ctx.tz); };
  const wk = /\bweek of\s+(.+?)(?:\s+look|\s+looks|[?.!]|$)/i.exec(text);
  if (wk) { const d = parseDate(wk[1], ctx.now, ctx.tz); if (d) { const m = mondayOf(zonedToUtc(d.y, d.m, d.d, 12, 0, ctx.tz)); return { from: m.getTime(), to: addDays(m, 7, ctx.tz).getTime(), label: `Week of ${fmtShortDate(m, ctx.tz)}`, future: m.getTime() > ctx.now.getTime() }; } }
  if (/\bnext week\b/i.test(text)) { const m = addDays(mondayOf(ctx.now), 7, ctx.tz); return { from: m.getTime(), to: addDays(m, 7, ctx.tz).getTime(), label: `Week of ${fmtShortDate(m, ctx.tz)}`, future: true }; }
  if (/\bthis week\b/i.test(text)) { const end = addDays(mondayOf(ctx.now), 7, ctx.tz); return { from: ctx.now.getTime(), to: end.getTime(), label: `This week, through ${fmtDay(addDays(end, -1, ctx.tz), ctx.tz)}`, future: false }; }
  void day; void sod;
  return { from: ctx.now.getTime(), to: ctx.now.getTime() + 7 * 86_400_000, label: "Next 7 days", future: false };
}

export async function weekOverviewHandler(ctx: Ctx, text = ""): Promise<HandlerOut> {
  const [events, tasks, contacts, props] = await Promise.all([ctx.store.list("calendar_events", ctx.userId), ctx.store.list("tasks", ctx.userId), ctx.store.list("contacts", ctx.userId), ctx.store.list("properties", ctx.userId)]);
  const rng = weekRange(ctx, text);
  const t0 = rng.from, t7 = rng.to;
  const week = events.filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > t0 && new Date(e.start_at).getTime() < t7).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of week) { const k = `${fmtDay(e.start_at, ctx.tz).slice(0, 3)} ${fmtShortDate(e.start_at, ctx.tz)}`; (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(e); }
  const deadlines = week.filter((e) => e.notes === TX_NOTE);
  const overdue = rng.future ? [] : tasks.filter((t) => t.status === "open" && t.due_at && new Date(t.due_at).getTime() < t0 - 3_600_000);
  const dueSoon = tasks.filter((t) => t.status === "open" && t.due_at && new Date(t.due_at).getTime() >= t0 - 3_600_000 && new Date(t.due_at).getTime() < t7 && t.subtitle?.startsWith(TX_NOTE) !== true);
  const quiet = rng.future ? [] : contacts.filter((c) => !["inactive", "closed"].includes(c.status) && t0 - new Date(c.last_contact_at ?? c.created_at).getTime() > 14 * 86_400_000).sort((a, b) => b.importance - a.importance).slice(0, 3);
  const cName = new Map(contacts.map((c) => [c.id, c.name]));
  const pAddr = new Map(props.map((p) => [p.id, p.address]));
  const sections: BriefSection[] = [...byDay].map(([day, es]) => ({
    emoji: "📅", label: `${day}${es.length >= 4 ? " · packed" : ""}`,
    items: es.map((e) => {
      const who = e.contact_id ? cName.get(e.contact_id) : null, where = e.property_id ? pAddr.get(e.property_id) : null;
      const base = e.title.split(" — ")[0].replace(/ with .*/i, "");
      return { text: `${new Date(e.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ctx.tz })} · ${base}${who ? ` for ${who}` : ""}${where ? ` · ${where}` : ""}`, state: "info" as const };
    }),
  }));
  const flags: BriefItem[] = [];
  if (deadlines.length) flags.push({ text: `${plural(deadlines.length, "contract deadline")} this week: ${deadlines.map((d) => d.title.split(" — ")[0].toLowerCase()).join(", ")}`, state: "missing" });
  if (overdue.length) flags.push({ text: `${plural(overdue.length, "task")} overdue, oldest: ${overdue[0].title}${overdue[0].contact_id && cName.get(overdue[0].contact_id) ? ` (${cName.get(overdue[0].contact_id)})` : ""}`, state: "missing", button: { label: "See tasks", style: "quiet", href: "/tasks" } });
  if (dueSoon.length) flags.push({ text: `${plural(dueSoon.length, "task")} due this week`, state: "info" });
  quiet.forEach((q) => flags.push({ text: `${q.name} has gone quiet (14+ days)`, state: "info", button: { label: "Draft a follow-up", style: "quiet", action: { type: "prompt", text: `Draft a follow-up for ${q.name}` } } }));
  const free = [...Array(7).keys()].map((i) => addDays(new Date(t0), i, ctx.tz)).filter((d) => d.getTime() < t7).find((d) => !byDay.has(`${fmtDay(d, ctx.tz).slice(0, 3)} ${fmtShortDate(d, ctx.tz)}`));
  if (free && week.length) flags.push({ text: `${fmtDay(free, ctx.tz)}, ${fmtShortDate(free, ctx.tz)} is open, good for follow-ups`, state: "done" });
  if (flags.length) sections.push({ emoji: "⚠️", label: "Needs your attention", items: flags });
  if (!sections.length) return reply("Your calendar is clear for the next 7 days. Want me to find who to follow up with?", [{ type: "choice", title: "Want me to…", buttons: [{ label: "Prioritize my follow-ups", style: "primary", action: { type: "prompt", text: "Who do I need to follow up with today?" } }] }], "chat_simple");
  return reply(`${rng.label}: you have ${plural(week.length, "thing")} on the calendar${overdue.length ? ` and ${plural(overdue.length, "overdue task")}` : ""}.`, [{ type: "listing_brief", kicker: rng.label, title: "Your week", done: 0, total: 0, sections, buttons: [{ label: "Prioritize my follow-ups", style: "primary", action: { type: "prompt", text: "Who do I need to follow up with today?" } }, { label: "Open calendar", style: "secondary", href: "/calendar" }] }], "chat_simple");
}

const RATE_KEY = "Commission rate";
export async function pipelineHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const stated = /(\d(?:\.\d+)?)\s*%/.exec(text)?.[1];
  if (stated && /\b(commission|comp|rate)\b/i.test(text) && +stated > 0 && +stated < 10) await saveMemory(ctx, { scope: "business", key: RATE_KEY, value: `${stated}%`, source: "user_stated" });
  const mems = await listMemories(ctx);
  const rateStr = mems.find((m) => m.key === RATE_KEY)?.value;
  const rate = rateStr ? parseFloat(rateStr) / 100 : 0.03;
  const [contacts, props] = await Promise.all([ctx.store.list("contacts", ctx.userId), ctx.store.list("properties", ctx.userId)]);
  const txn = new Map(mems.filter((m) => m.scope === "property" && m.key === "Transaction").map((m) => [m.subject_id, m.value]));
  // the same stages the Properties page shows: "active" means live on the market right now, not every saved address that has a price
  const { buildCard } = await import("../../property-stage");
  const events = await ctx.store.list("calendar_events", ctx.userId);
  const stageOf = new Map(props.map((p) => [p.id, buildCard(p, mems, events, [], ctx.now).stage]));
  const under = props.filter((p) => txn.get(p.id)?.startsWith("Under contract") || stageOf.get(p.id) === "under_contract");
  const sold = props.filter((p) => txn.get(p.id)?.startsWith("Sold") || stageOf.get(p.id) === "sold");
  const looksRent = (p: { list_price: number | null }) => (p.list_price ?? 0) < 20_000; // $2,500 is a monthly rent, not a sale price: left out of sale totals
  const rents = props.filter((p) => !p.is_demo && !under.includes(p) && !sold.includes(p) && p.list_price && looksRent(p));
  const listings = props.filter((p) => !p.is_demo && !under.includes(p) && !sold.includes(p) && (stageOf.get(p.id) === "active" || (stageOf.get(p.id) === "upcoming" && p.verified)) && p.list_price && !looksRent(p)); // live homes, plus ones the agent entered and confirmed; saved search results and imports never inflate it
  const buyers = contacts.filter((c) => c.type === "buyer" && !["inactive", "closed"].includes(c.status) && c.budget_max);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const uVal = sum(under.map((p) => p.list_price ?? 0)), lVal = sum(listings.map((p) => p.list_price ?? 0)), bVal = sum(buyers.map((c) => c.budget_max ?? 0));
  const lines = [
    `Under contract: ${under.length} · ${fullMoney(uVal)} volume → about ${fullMoney(Math.round(uVal * rate))} in commission.`,
    `Active listings: ${listings.length} · ${fullMoney(lVal)} → about ${fullMoney(Math.round(lVal * rate))} if they all sell at list.`,
    ...(rents.length ? [`Left out of sale totals (price looks like a monthly rent): ${rents.map((p) => p.address).join(", ")}.`] : []),
    `Active buyers: ${buyers.length} · combined budgets ${fullMoney(bVal)} (potential ${fullMoney(Math.round(bVal * rate))}, but only a share will close).`,
  ];
  const nothing = !under.length && !listings.length && !buyers.length;
  return reply(nothing ? "Your pipeline is empty so far. Tell me about a listing (“New listing at 12 Oak St, $650k”) or a buyer with a budget and I'll start tracking the numbers." : `${lines.join("\n")}\n\nThat's gross commission before splits and fees, at ${rateStr ?? "3% (my assumption)"}. ${rateStr ? "" : "Tell me your real rate (“my commission is 2.5%”) and I'll use it."}${sold.length ? `\nYou've closed ${plural(sold.length, "deal")} so far.` : ""}`, [], "chat_simple");
}
