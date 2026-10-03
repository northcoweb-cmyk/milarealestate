import { addDays, fmtDay, fmtShortDate, fmtTime, partsIn, zonedToUtc } from "../../time";
import type { Block, CalendarEvent, Contact, Property, Task } from "../../types";
import type { Ctx } from "../context";
import { fullMoney, plural } from "../context";
import { persistState } from "../conversation";
import { extractListingFacts } from "../listing";
import { learnDetailed } from "../learn";
import { listMemories, saveMemory } from "../memory";
import { capitalisedNames, parseAddress, parseDate } from "../nlu";
import type { Intent } from "../intents";
import { locationGate } from "./location";
import { TOOLS, invoke, logContactEvent } from "../tools";
import { askBack } from "./ask";
import { mentionedContacts } from "./contacts";
import { type HandlerOut, reply } from "./types";

const TX_NOTE = "Transaction milestone";
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
  { key: "closing", label: "Closing", re: /\bclos(?:ing|e)\b/i, def: 0, h: 10 },
] as const;

/** The date written right after a keyword ("inspection in 7 days", "appraisal by the 28th", "closing November 20"). */
function dateAfter(text: string, re: RegExp, all: RegExp[], now: Date, tz: string) {
  const m = re.exec(text);
  if (!m) return null;
  let rest = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 48);
  for (const o of all) { if (o === re) continue; const n = o.exec(rest); if (n) rest = rest.slice(0, n.index); }
  rest = rest.split(/[;,]|\band\b/i)[0];
  return parseDate(rest, now, tz);
}

export async function transactionHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const found0 = await propertyFor(ctx, text, "transaction");
  if (found0 && "out" in found0) return found0.out;
  const prop = found0?.prop ?? null;
  if (!prop) return askBack(ctx, "transaction", text, "address", "Congrats! Which property is it? Give me the address and the closing date and I'll build the whole timeline.");
  ctx.state.last_property_id = prop.id;
  const all = MILESTONES.map((m) => m.re);
  const found: Record<string, ReturnType<typeof parseDate>> = {};
  for (const m of MILESTONES) found[m.key] = dateAfter(text, m.re, all, ctx.now, ctx.tz);
  if (!found.closing) { // answering "what's the closing date?" gives just a date: use the one that no other milestone claimed
    let rest = text;
    for (const m of MILESTONES) { const x = m.re.exec(rest); if (x) rest = rest.slice(0, x.index) + " " + rest.slice(x.index + x[0].length + 48); }
    found.closing = parseDate(rest.replace(/\b\d{1,6}\s+[A-Za-z.' ]{2,30}?\b(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|way|blvd|boulevard|place|pl|terrace|circle|trail)\b/gi, " "), ctx.now, ctx.tz);
  }
  if (!found.closing) return askBack(ctx, "transaction", text, "date", `What's the closing date for ${prop.address}? I'll set up the inspection, appraisal and financing deadlines around it.`);
  const closeAt = zonedToUtc(found.closing.y, found.closing.m, found.closing.d, 10, 0, ctx.tz);
  if (closeAt.getTime() < ctx.now.getTime()) return askBack(ctx, "transaction", text, "date", `${fmtDay(closeAt, ctx.tz)} has already passed. What's the real closing date?`);
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
    await invoke(ctx, "create_calendar_event", { title: `${r.label} — ${prop.address}`, kind: r.kind, start_at: r.start.toISOString(), end_at: new Date(r.start.getTime() + (r.key === "closing" ? 2 : 1) * 3_600_000).toISOString(), location: prop.address, property_id: prop.id, notes: TX_NOTE, ignoreConflicts: true });
    await TOOLS.create_task.run(ctx, { kind: "task", title: `${r.label} — ${prop.address}`, subtitle: `${TX_NOTE}${r.estimated ? " · typical timing, confirm with your contract" : ""}`, property_id: prop.id, due_at: r.start.toISOString(), internal: true });
  }
  await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: "Transaction", value: `Under contract · closing ${fmtDay(closeAt, ctx.tz)}`, source: "user_stated" });
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
  await saveMemory(ctx, { scope: "property", subject_id: prop.id, key: "Transaction", value: `Sold${price ? ` ${fullMoney(price)}` : ""} · closed ${fmtDay(closedOn, ctx.tz)}`, source: "user_stated" });
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
  let c: Contact | null = known[0] ?? null;
  let added = false;
  if (!c) {
    const name = capitalisedNames(text).find((n) => n.length > 2);
    if (!name) return askBack(ctx, "log_interaction", text, "name", "Who was it? I'll log it and set the follow-up.");
    const r = (await TOOLS.create_contact.run(ctx, { name, type: "lead", status: "new", source: "Logged from chat" })) as any;
    if (!r.ok) return reply("I couldn't save that contact.");
    c = r.data.contact as Contact; added = true;
  }
  const first = c.name.split(/\s+/)[0];
  const verb = (VERB.exec(text)?.[1] ?? "call").toLowerCase();
  const kind = /text|dm/.test(verb) ? "text" : /email/.test(verb) ? "email" : /met|stopped|came/.test(verb) ? "meeting" : "call";
  await logContactEvent(ctx, c.id, kind, `${kind[0].toUpperCase()}${kind.slice(1)} logged`, text.slice(0, 400));
  await ctx.store.update("contacts", ctx.userId, c.id, { last_contact_at: ctx.now.toISOString() } as never);
  const learned = (await learnDetailed(ctx, text)).filter((i) => i.contact?.id === c!.id);
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
  const saved = learned.length ? `\nSaved to ${first}'s profile:\n${learned.map((i) => `• ${i.key}: ${i.value}`).join("\n")}` : "";
  return reply(`Logged your ${kind} with ${c.name}${added ? " (I didn't have them, so I added them as a new lead)" : ""} and set a follow-up for tomorrow at 9 AM: “${title}”.${saved}`, blocks, "chat_simple");
}

// ------------------------------------------------------------------ text message drafts (sent from the agent's own phone — one tap)

export async function draftTextHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const known = await mentionedContacts(ctx, text);
  const c = known[0] ?? null;
  const name = c?.name ?? capitalisedNames(text).find((n) => !/^(Text|Message|Tell|Send)$/i.test(n)) ?? "";
  const first = name.split(/\s+/)[0];
  if (!first) return askBack(ctx, "draft_text", text, "name", "Who should I text?");
  let body = text.replace(/^.*?\b(?:text|sms|message|msg|tell)\b\s+/i, "").replace(new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+\\p{L}+)?\\s*`, "iu"), "").replace(/^(?:that|saying|to say|:|-)\s*/i, "").trim().replace(/[.!\s]+$/, "");
  if (!body) body = "just checking in — do you have a few minutes to talk?";
  body = body.replace(/\b(?:her|him|them)\b/gi, "you").replace(/\bhis\b|\bher\b|\btheir\b/gi, "your").replace(/^i'?ll\b/i, "I'll").replace(/^(\w)/, (m) => m.toLowerCase() === "i" ? "I" : m);
  const me = ctx.profile.full_name.split(/\s+/)[0];
  const msg = `Hi ${first}, ${/^I\b|^I'/.test(body) ? body : body[0].toLowerCase() + body.slice(1)}. – ${me}`.replace(/\.\.+/g, ".");
  const phone = c?.phone?.replace(/[^\d+]/g, "") ?? "";
  const href = `sms:${phone}?&body=${encodeURIComponent(msg)}`;
  if (c) await logContactEvent(ctx, c.id, "text", "Text drafted", msg);
  ctx.state.last_contact_ids = c ? [c.id] : ctx.state.last_contact_ids;
  return reply(`Here's the text to ${first}:\n\n“${msg}”\n\n${phone ? "Tap below and it opens in your Messages, ready to send." : `I don't have a number for ${first} yet — tap below to pick them in Messages.`} I don't send texts myself, so nothing goes out until you tap Send.`, [{
    type: "choice", title: `Text ${first}`,
    buttons: [{ label: `Open in Messages`, style: "primary", href }, ...(c ? [{ label: "Open profile", style: "quiet" as const, href: `/contacts/${c.id}` }] : [])],
  }], "chat_simple");
}

// ------------------------------------------------------------------ week overview + pipeline

export async function weekOverviewHandler(ctx: Ctx): Promise<HandlerOut> {
  const [events, tasks, contacts, props] = await Promise.all([ctx.store.list("calendar_events", ctx.userId), ctx.store.list("tasks", ctx.userId), ctx.store.list("contacts", ctx.userId), ctx.store.list("properties", ctx.userId)]);
  const t0 = ctx.now.getTime(), t7 = t0 + 7 * 86_400_000;
  const week = events.filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > t0 && new Date(e.start_at).getTime() < t7).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of week) { const k = `${fmtDay(e.start_at, ctx.tz).slice(0, 3)} ${fmtShortDate(e.start_at, ctx.tz)}`; (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(e); }
  const deadlines = week.filter((e) => e.notes === TX_NOTE);
  const overdue = tasks.filter((t) => t.status === "open" && t.due_at && new Date(t.due_at).getTime() < t0 - 3_600_000);
  const dueSoon = tasks.filter((t) => t.status === "open" && t.due_at && new Date(t.due_at).getTime() >= t0 - 3_600_000 && new Date(t.due_at).getTime() < t7 && t.subtitle?.startsWith(TX_NOTE) !== true);
  const quiet = contacts.filter((c) => !["inactive", "closed"].includes(c.status) && (!c.last_contact_at || t0 - new Date(c.last_contact_at).getTime() > 14 * 86_400_000)).sort((a, b) => b.importance - a.importance).slice(0, 3);
  const lines: string[] = [];
  if (!week.length) lines.push("Your calendar is clear for the next 7 days.");
  for (const [day, es] of byDay) lines.push(`${day}${es.length >= 4 ? " (packed)" : ""}: ${es.map((e) => `${new Date(e.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ctx.tz })} ${e.title.split(/ — |, /)[0]}`).join(" · ")}`);
  const flags: string[] = [];
  if (deadlines.length) flags.push(`${plural(deadlines.length, "contract deadline")} this week (${deadlines.map((d) => d.title.split(" — ")[0].toLowerCase()).join(", ")}).`);
  if (overdue.length) flags.push(`${plural(overdue.length, "task")} overdue — oldest: ${overdue[0].title}.`);
  if (dueSoon.length) flags.push(`${plural(dueSoon.length, "task")} due this week.`);
  if (quiet.length) flags.push(`Going quiet (14+ days): ${quiet.map((q) => q.name).join(", ")} — worth a touch this week.`);
  const free = [...Array(7).keys()].map((i) => addDays(ctx.now, i, ctx.tz)).find((d) => !byDay.has(`${fmtDay(d, ctx.tz).slice(0, 3)} ${fmtShortDate(d, ctx.tz)}`));
  if (free && week.length) flags.push(`${fmtDay(free, ctx.tz)}, ${fmtShortDate(free, ctx.tz)} is open — a good day for follow-ups or prospecting.`);
  void props;
  return reply(`${lines.join("\n")}${flags.length ? `\n\n${flags.join("\n")}` : ""}`, [{ type: "choice", title: "Want me to…", buttons: [
    { label: "Prioritize my follow-ups", style: "primary", action: { type: "prompt", text: "Who do I need to follow up with today?" } },
    { label: "Open calendar", style: "secondary", href: "/calendar" },
  ] }], "chat_simple");
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
  const under = props.filter((p) => txn.get(p.id)?.startsWith("Under contract"));
  const sold = props.filter((p) => txn.get(p.id)?.startsWith("Sold"));
  const listings = props.filter((p) => !p.is_demo && !under.includes(p) && !sold.includes(p) && p.list_price);
  const buyers = contacts.filter((c) => c.type === "buyer" && !["inactive", "closed"].includes(c.status) && c.budget_max);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const uVal = sum(under.map((p) => p.list_price ?? 0)), lVal = sum(listings.map((p) => p.list_price ?? 0)), bVal = sum(buyers.map((c) => c.budget_max ?? 0));
  const lines = [
    `Under contract: ${under.length} · ${fullMoney(uVal)} volume → about ${fullMoney(Math.round(uVal * rate))} in commission.`,
    `Active listings: ${listings.length} · ${fullMoney(lVal)} → about ${fullMoney(Math.round(lVal * rate))} if they all sell at list.`,
    `Active buyers: ${buyers.length} · combined budgets ${fullMoney(bVal)} (potential ${fullMoney(Math.round(bVal * rate))}, but only a share will close).`,
  ];
  const nothing = !under.length && !listings.length && !buyers.length;
  return reply(nothing ? "Your pipeline is empty so far. Tell me about a listing (“New listing at 12 Oak St, $650k”) or a buyer with a budget and I'll start tracking the numbers." : `${lines.join("\n")}\n\nThat's gross commission before splits and fees, at ${rateStr ?? "3% (my assumption)"}. ${rateStr ? "" : "Tell me your real rate (“my commission is 2.5%”) and I'll use it."}${sold.length ? `\nYou've closed ${plural(sold.length, "deal")} so far.` : ""}`, [], "chat_simple");
}
