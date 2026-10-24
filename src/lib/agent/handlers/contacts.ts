import { askWhichPerson, ambiguousFirstName, pickProperty } from "./entity";
import { parseDate, plausibleName } from "../nlu";
import { addDays, fmtDayTime, fmtTime, partsIn, startOfDay, zonedToUtc } from "../../time";
import type { Block, Contact, ContactType, DocumentTemplate, WorkflowRun } from "../../types";
import { type Ctx, firstName, fullMoney, label, money, pickColor, plural } from "../context";
import { persistState } from "../conversation";
import { firstNameOf } from "../../names";
import { buildDebrief, coverageNote, greetingFor } from "../debrief";
import { contactFacts, listMemories, saveMemory } from "../memory";
import { resolveAddress } from "../property-lookup";
import { isStopName, capitalisedNames, parseAddress, parseBaths, parseBeds, parseContactType, parseEmail, parseLocation, parseMoney, parsePersonName, parsePhone, parseTimeline } from "../nlu";
import { computePriorities } from "../prioritize";
import { TOOLS, invoke } from "../tools";
import { type HandlerOut, reply } from "./types";

const FEATURES: [RegExp, string][] = [[/garage/i, "Garage"], [/\bpool\b/i, "Pool"], [/yard|fenced/i, "Yard"], [/basement/i, "Basement"], [/new construction/i, "New construction"], [/single[- ]family/i, "Single-family"], [/town ?(home|house)/i, "Townhome"], [/condo/i, "Condo"], [/main[- ]level|first[- ]floor/i, "Main-level living"], [/good schools?|school district/i, "Good schools"], [/commut/i, "Short commute"]];

const WORKFLOW_BY_TYPE: Record<string, { key: string; kicker: string }> = {
  buyer: { key: "new_buyer", kicker: "NEW BUYER" }, seller: { key: "new_seller", kicker: "NEW SELLER" }, rental: { key: "new_rental", kicker: "NEW RENTAL CLIENT" },
  investor: { key: "investor", kicker: "NEW INVESTOR" }, lead: { key: "new_lead", kicker: "NEW LEAD" }, past_client: { key: "past_client", kicker: "PAST CLIENT" },
};

export async function newContactHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  // "add michelle as a lead" when Michelle Turner is already saved: update her, never create a second, made-up person
  const asType = /^\s*(?:please\s+)?add\s+([\p{L}'’-]+)\s+as\s+(?:a\s+|an\s+|my\s+)?(lead|buyer|seller|renter|tenant|investor|client|prospect)\b/iu.exec(text);
  if (asType) {
    const first = asType[1].toLowerCase();
    const known = (await ctx.store.list("contacts", ctx.userId)).filter((c) => c.name.toLowerCase().split(/\s+/)[0] === first);
    const fromLast = ctx.state.last_contact_ids?.length === 1 ? known.find((c) => c.id === ctx.state.last_contact_ids![0]) : undefined;
    const hit = fromLast ?? (known.length === 1 ? known[0] : undefined);
    if (hit) {
      const type = (parseContactType(text) ?? hit.type) as ContactType;
      if (type !== hit.type) await ctx.store.update("contacts", ctx.userId, hit.id, { type });
      ctx.state.last_contact_ids = [hit.id];
      return reply(type === hit.type ? `${hit.name} is already saved as a ${label(hit.type).toLowerCase()}. Want me to draft a follow-up?` : `Done. ${hit.name} is now a ${label(type).toLowerCase()}.`, [{ type: "choice", title: hit.name, buttons: [{ label: "Draft a follow-up", style: "primary", action: { type: "prompt", text: `Draft a follow-up email to ${hit.name}` } }, { label: "Open profile", style: "quiet", href: `/contacts/${hit.id}` }] }]);
    }
  }
  // "add her as a seller": her = the person just talked about (a saved contact, a name in this message, or the latest full name said in this chat)
  const pron = /\badd\s+(?:her|him|them)\s+as\s+(?:a\s+|an\s+)?(buyer|seller|lead|renter|investor|client)\b/i.exec(text);
  if (pron) {
    const type = parseContactType(text) ?? "lead";
    const inMsg = capitalisedNames(text).filter((n) => n.includes(" ") && plausibleName(n)).pop();
    const last = !inMsg && ctx.state.last_contact_ids?.length === 1 ? await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]) : null;
    if (last) {
      await ctx.store.update("contacts", ctx.userId, last.id, { type: type as ContactType });
      return reply(`Done. ${last.name} is now a ${label(type as ContactType).toLowerCase()}.`, [{ type: "choice", title: last.name, buttons: [{ label: "Open profile", style: "secondary", href: `/contacts/${last.id}` }] }], "chat_simple");
    }
    const said = await nameFromChat(ctx, text);
    if (said) return newContactHandler(ctx, `Add ${said} as a ${type}`);
    ctx.state.pending = { kind: "clarify", intent: "new_contact", slots: { text: text.replace(/\badd\s+(?:her|him|them)\b/i, "add") }, missing: "name" };
    await persistState(ctx);
    return reply("What's their name?");
  }
  const parsed = parsePersonName(text);
  const name = plausibleName(parsed) ? parsed : null; // never save a complaint or filler as a person
  if (!name) {
    ctx.state.pending = { kind: "clarify", intent: "new_contact", slots: { text }, missing: "name" };
    await persistState(ctx);
    return reply("What's their name?");
  }
  const type = (parseContactType(text) ?? "lead") as ContactType;
  const money$ = parseMoney(text);
  const beds = parseBeds(text), baths = parseBaths(text);
  const features = FEATURES.filter(([re]) => re.test(text)).map(([, f]) => f);
  let location = parseLocation(text);
  if (location && !/,\s*[A-Z]{2}$|\bCounty\b/.test(location)) { // a city with no state is in the agent's own state
    const st = /,\s*([A-Z]{2})\b/.exec(`${ctx.profile.location ?? ""} ${ctx.profile.primary_market ?? ""}`)?.[1];
    if (st) location = `${location}, ${st}`;
  }
  const timeline = parseTimeline(text);
  const email = parseEmail(text), phone = parsePhone(text);

  const wf = WORKFLOW_BY_TYPE[type] ?? WORKFLOW_BY_TYPE.lead;
  const plan: WorkflowRun["plan"] = [];
  const run = await ctx.store.insert("workflow_runs", ctx.userId, { workflow_key: wf.key, title: name, subtitle: null, status: "running", params: { text }, plan: [], outputs: {} });

  // same name but a different phone number is a different person (or a new lead for the same name): a new contact, never an overwrite
  const digits = (x: string | null | undefined) => (x ?? "").replace(/\D/g, "").slice(-10);
  const sameName = phone ? (await ctx.store.list("contacts", ctx.userId)).filter((c) => c.name.toLowerCase() === name.toLowerCase()) : [];
  const differentPerson = !!phone && sameName.length > 0 && sameName.every((c) => digits(c.phone) && digits(c.phone) !== digits(phone));
  const out = await invoke(ctx, "create_contact", {
    force: differentPerson || undefined,
    name, type, email, phone, location, timeline, budget_max: money$.max, budget_min: money$.min,
    preferences: { ...(beds ? { beds_min: beds } : {}), ...(baths ? { baths_min: baths } : {}), ...(features.length ? { features } : {}) },
    status: "new", source: "Mila", next_action: type === "seller" ? null : "Intro call / confirm search criteria", next_action_at: type === "seller" ? null : new Date(ctx.now.getTime() + 24 * 3_600_000).toISOString(),
    importance: money$.max && money$.max >= 800_000 ? 3 : 2,
  }, { runId: run.id });
  if (out.status === "needs_approval") {
    plan.push({ label: `Create ${label(type).toLowerCase()} profile`, tool: "create_contact", state: "needs_approval" });
    await ctx.store.update("workflow_runs", ctx.userId, run.id, { plan, status: "waiting_approval" });
    return reply("Ready to add them once you confirm.", [{ type: "notice", tone: "info", title: out.approval.title, body: out.approval.summary ?? undefined, buttons: [{ label: "Approve", style: "primary", approvalId: out.approval.id }] }]);
  }
  if (!out.result.ok) return reply(`I couldn't add ${name}: ${out.result.message}`);
  let { contact, existing } = out.result.data as { contact: Contact; existing: boolean };

  if (existing) {
    // merge new facts into the existing record rather than duplicating
    const patch: Partial<Contact> = { preferences: { ...(beds ? { beds_min: beds } : {}), ...(baths ? { baths_min: baths } : {}), ...(features.length ? { features } : {}) } };
    if (phone && !contact.phone) patch.phone = phone; // the details just given are saved on the person, never dropped
    if (email && !contact.email) patch.email = email;
    if (contact.status === "inactive") patch.status = "new"; // adding someone who was set aside brings them back
    if (location) patch.location = location;
    if (timeline) patch.timeline = timeline;
    if (money$.max) patch.budget_max = money$.max;
    if (money$.min) patch.budget_min = money$.min;
    const u = await TOOLS.update_contact.run(ctx, { id: contact.id, patch, eventTitle: "Details updated by Mila", eventKind: "note" });
    if (u.ok) contact = (u.data as any).contact;
  }
  plan.push({ label: existing ? `Updated ${firstName(name)}'s profile` : `Created ${label(type).toLowerCase()} profile`, tool: "create_contact", state: "done" });
  ctx.state.last_contact_ids = [contact.id];

  // a seller who comes with an address: that home is saved exactly as typed (city, state and ZIP included) and noted on them, never left behind
  const homeAddr = type === "seller" ? parseAddress(text) : null;
  let sellerHome: string | null = null;
  if (homeAddr) {
    const r = await resolveAddress(ctx, text, homeAddr, { answering: false }).catch(() => null);
    const place = r && r.status === "ok" ? r.place : null;
    const made = (await TOOLS.create_property.run(ctx, { address: homeAddr, city: place?.city ?? null, state: place?.state ?? null, zip: place?.zip ?? null, county: null, list_price: null, beds: null, baths: null, sqft: null }).catch(() => null)) as any;
    const prop = made?.data?.property;
    if (prop) {
      ctx.state.last_property_id = prop.id;
      sellerHome = [prop.address, prop.city, [prop.state, prop.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      await ctx.store.insert("contact_notes", ctx.userId, { contact_id: contact.id, body: `Home to list: ${sellerHome}` } as never);
      plan.push({ label: "Saved their home", tool: "create_property", state: "done", detail: sellerHome });
    }
  }

  // memory: durable, structured, editable
  const crit = [beds && `${beds}+ bedrooms`, baths && `${baths}+ baths`, ...features, location, money$.max && `~${fullMoney(money$.max)}`, timeline && `Timeline: ${timeline}`].filter(Boolean).join(" • ");
  if (crit) {
    await saveMemory(ctx, { scope: "contact", subject_id: contact.id, key: type === "seller" ? "Selling criteria" : "Search criteria", value: crit, source: "user_stated" });
    plan.push({ label: "Saved search criteria", tool: "save_memory", state: "done", detail: crit });
  }

  // first follow-up
  // "call Tuesday" / "follow up next week": the day the agent named, else tomorrow
  const named = /\b(?:call|ring|follow(?:\s|-)?up(?:\s+with\s+(?:him|her|them))?|reach(?:\s+out)?|check\s+in|text|email)\b[^.;,]{0,25}?\b((?:next\s+)?(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*|today|tomorrow|next\s+week)\b/i.exec(text);
  const day = named ? parseDate(named[1], ctx.now, ctx.tz) : null;
  const tmr = day ?? partsIn(addDays(ctx.now, 1, ctx.tz), ctx.tz);
  const due = zonedToUtc(tmr.y, tmr.m, tmr.d, 10, 0, ctx.tz).toISOString();
  const dueLabel = day ? fmtDayTime(new Date(due), ctx.tz) : "Tomorrow, 10:00 AM";
  if (type === "seller") plan.push({ label: "No follow-up scheduled", tool: "create_task", state: "skipped", detail: "Tell me when you want to reach out" });
  else {
    const t = await invoke(ctx, "create_task", { kind: "follow_up", title: `Intro call with ${firstName(name)}`, subtitle: "Confirm criteria and book a consultation", due_at: due, contact_id: contact.id, workflow_run_id: run.id }, { runId: run.id });
    plan.push({ label: "First follow-up", tool: "create_task", state: t.status === "done" && t.result.ok ? "done" : "needs_approval", detail: dueLabel });
  }

  // intake documents: use the agent's own template when one exists, never invent legal language
  const templates = await ctx.store.list("document_templates", ctx.userId);
  const tmpl = templates.find((x) => x.is_default && x.kind === (type === "seller" ? "seller_document" : "buyer_document"));
  if (tmpl) {
    const { fillTemplate } = await import("../templates");
    const filled = await fillTemplate(ctx, tmpl, { contact });
    plan.push({ label: `${tmpl.name} prepared`, tool: "prepare_document", state: "done", detail: filled.missing.length ? `Needs: ${filled.missing.join(", ")}` : "Ready to review" });
  } else if (type === "buyer" || type === "seller") {
    plan.push({ label: type === "buyer" ? "Buyer agreement" : "Listing agreement", tool: "create_task", state: "pending", detail: "Upload your template in More → Templates and I'll prepare it" });
  }

  const needQ = !existing && (type === "buyer" || type === "lead" || type === "seller") && [!money$.max && "budget", !location && "area", !timeline && "timeline"].filter(Boolean).length >= 2;
  await ctx.store.update("workflow_runs", ctx.userId, run.id, { plan, status: "completed", subtitle: [money$.max && money(money$.max), location, timeline].filter(Boolean).join(" • ") || null });
  await persistState(ctx);
  return reply(existing ? `I already had ${name}, so I updated her record.`.replace("her", "their") : `Got it. ${name} is set up.`, [{
    type: "workflow", runId: run.id, kicker: wf.kicker, title: name, subtitle: [money$.max && money(money$.max), location, timeline].filter(Boolean).join(" • ") || label(type),
    items: plan.map((p) => ({ label: p.label, state: p.state, detail: p.detail })),
    buttons: [
      ...((type === "buyer" || (type as string) === "rental") && location ? [{ label: `🔎 Find listings for ${firstName(name)}`, style: "primary" as const, action: { type: "prompt" as const, text: (type as string) === "rental" || /\brent(al|ing)?\b/i.test(text) ? `Find rentals in ${location}${money$.max ? ` under ${fullMoney(money$.max)}` : ""}${beds ? ` with ${beds}+ bedrooms` : ""} for ${name}` : `Show me new listings in ${location}${money$.max ? ` under ${fullMoney(money$.max)}` : ""}${beds ? ` with ${beds}+ bedrooms` : ""}` } }] : []),
      { label: "Open profile", style: existing || !location ? "primary" : "secondary", href: `/contacts/${contact.id}` },
    ],
  }, ...(needQ ? [questionsBlock(contact, type)] : [])], "workflow_default");
}

const Q_BUYER = [{ key: "budget", label: "Budget", placeholder: "e.g. $500k" }, { key: "area", label: "Where", placeholder: "e.g. Rockville, MD" }, { key: "beds", label: "Bedrooms", placeholder: "e.g. 3" }, { key: "timeline", label: "Timeline", placeholder: "e.g. next 3 months" }, { key: "preapproved", label: "Pre-approved?", placeholder: "e.g. yes or no" }];
const Q_SELLER = [{ key: "home", label: "Their home", placeholder: "e.g. 12 Oak St" }, { key: "budget", label: "Hoped-for price", placeholder: "e.g. $650k" }, { key: "timeline", label: "Timeline", placeholder: "e.g. list in spring" }, { key: "why", label: "Why selling", placeholder: "e.g. relocating" }];
/** One card, one tap: the questions worth asking a new client, answered all at once. */
export const questionsBlock = (c: Contact, type: ContactType): Block => ({ type: "questions", title: `Quick questions for ${firstName(c.name)}`, contactId: c.id, fields: type === "seller" ? Q_SELLER : Q_BUYER });

/** The answers from the quick-questions card: saved straight onto the contact (never guessed). */
export async function saveAnswers(ctx: Ctx, contactId: string, answers: Record<string, string>): Promise<HandlerOut> {
  const c = await ctx.store.get("contacts", ctx.userId, contactId);
  if (!c) return reply("I couldn't find that contact.", [], "smalltalk");
  const a = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, String(v ?? "").trim().slice(0, 200)]).filter(([, v]) => v));
  if (!Object.keys(a).length) return reply("I didn't get any answers, so nothing changed.", [], "smalltalk");
  const patch: Partial<Contact> = {}; const notes: string[] = [];
  if (a.budget) { const m = parseMoney(a.budget); if (m.max) patch.budget_max = m.max; if (m.min) patch.budget_min = m.min; }
  if (a.area) patch.location = a.area;
  if (a.timeline) patch.timeline = a.timeline;
  if (a.beds) { const n = parseBeds(`${a.beds} bedrooms`); if (n) patch.preferences = { beds_min: n }; }
  if (a.preapproved) notes.push(`Pre-approved: ${a.preapproved}`);
  if (a.home) notes.push(`Home: ${a.home}`);
  if (a.why) notes.push(`Reason for selling: ${a.why}`);
  if (notes.length) patch.notes = [c.notes, notes.join(". ")].filter(Boolean).join("\n");
  await TOOLS.update_contact.run(ctx, { id: c.id, patch, eventTitle: "Answers saved by Mila", eventKind: "note" });
  for (const n of notes) { const [k, ...v] = n.split(": "); await saveMemory(ctx, { scope: "contact", subject_id: c.id, key: k, value: v.join(": "), source: "user_stated" }); }
  ctx.state.last_contact_ids = [c.id];
  const first = firstName(c.name);
  const buyer = c.type === "buyer" || c.type === "lead";
  return reply(`Saved. ${first}'s profile is updated.`, [{ type: "choice", title: `Next for ${first}`, buttons: [...(buyer && (patch.location ?? c.location) ? [{ label: `🔎 Find listings for ${first}`, style: "primary" as const, action: { type: "prompt" as const, text: `Show me new listings in ${patch.location ?? c.location}${patch.budget_max ? ` under ${fullMoney(patch.budget_max)}` : ""}` } }] : []), { label: "Open profile", style: "secondary", href: `/contacts/${c.id}` }] }], "smalltalk");
}

export async function prioritiesHandler(ctx: Ctx): Promise<HandlerOut> {
  const pr = (await computePriorities(ctx)).filter((x) => x.score >= 28 && /overdue|due today|waiting on you|follow-up due|no contact in|not yet contacted/i.test(x.reason)); // only what is really due this week, never a task that is merely scheduled for later
  if (!pr.length) return reply("You're all caught up. Nothing needs a follow-up right now.");
  const caps = { urgent: 3, important: 3, upcoming: 2, low: 0 } as const; // a short, real list for this week
  const seen = new Set<string>(); // each person once, in their highest group
  const once = (x: (typeof pr)[number]) => { const k = x.contactId ?? x.id; if (seen.has(k)) return false; seen.add(k); return true; };
  const groups = (["urgent", "important", "upcoming"] as const).map((p) => ({
    priority: p,
    items: pr.filter((x) => x.priority === p && x.source !== "event" && once(x)).slice(0, caps[p]).map((x) => ({ id: x.id, title: x.title, subtitle: x.subtitle, reason: x.reason || undefined, contactId: x.contactId ?? undefined, href: x.contactId ? `/contacts/${x.contactId}` : x.taskId ? "/tasks" : undefined })),
  })).filter((g) => g.items.length);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (!total) return reply("Nothing needs follow-up right now.");
  const urgent = groups.find((g) => g.priority === "urgent")?.items.length ?? 0;
  return reply(urgent ? `${urgent} urgent${total > urgent ? `, ${total} in all` : ""}. Here's everything, in order.` : `Nothing is urgent. Here's what's worth your attention.`, [{ type: "priorities", groups, buttons: [{ label: "Open Tasks", style: "secondary", href: "/tasks" }] }]);
}

export async function debriefHandler(ctx: Ctx, text = ""): Promise<HandlerOut> {
  const tomorrow = /\btomorrow\b/i.test(text);
  if (tomorrow) ctx = { ...ctx, now: addDays(ctx.now, 1, ctx.tz) }; // "plan my day tomorrow": the same plan, for tomorrow
  const d = await buildDebrief(ctx);
  const rem = (await ctx.store.list("reminders", ctx.userId)).filter((r) => r.status === "pending" && new Date(r.remind_at) >= startOfDay(ctx.now, ctx.tz) && new Date(r.remind_at) < addDays(startOfDay(ctx.now, ctx.tz), 1, ctx.tz)).sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  const cov = await coverageNote(ctx);
  const line = (e: { start_at: string; title: string }) => `• ${fmtTime(e.start_at, ctx.tz)}  ${e.title}`;
  const dayWord = tomorrow ? "tomorrow" : "today";
  const today = d.today.length || rem.length ? `${tomorrow ? "Tomorrow" : "Today"} you have ${plural(d.today.length + rem.length, "thing")}:\n${[...d.today.slice(0, 8).map((e) => ({ t: e.start_at, s: line(e) })), ...rem.slice(0, 6).map((r) => ({ t: r.remind_at, s: `• ${fmtTime(r.remind_at, ctx.tz)}  Reminder: ${r.title}` }))].sort((a, b) => a.t.localeCompare(b.t)).map((x) => x.s).join("\n")}` : `Nothing is on your calendar ${dayWord}.`;
  const blocks: Block[] = [{ type: "debrief", greeting: greetingFor(ctx.now, ctx.tz, ctx.profile.full_name).toUpperCase(), counts: d.counts, noticed: d.noticed, buttons: [{ label: "Open Home", style: "secondary", href: "/" }] }];
  if (cov) blocks.push({ type: "notice", tone: "info", title: "What this plan can see", body: cov.text, buttons: [{ label: "See connections", style: "secondary", href: "/settings/connections" }] });
  return reply(`Here's your day. ${today}${cov ? `\n\n${cov.text}` : ""}`, blocks);
}

/** Rank the agent's buyers and renters against one property: beds, budget, area, type. Pure scoring over saved data, no outside calls. */
export async function matchBuyersHandler(ctx: Ctx, text: string): Promise<HandlerOut | null> {
  const props = await ctx.store.list("properties", ctx.userId);
  const t = text.toLowerCase();
  const named = props.find((p) => t.includes(p.address.toLowerCase().replace(/\b(street|drive|road|lane|court|avenue|boulevard)\b/g, (m) => m).split(",")[0]));
  const byStreet = props.find((p) => { const first = p.address.toLowerCase().split(/\s+/).slice(0, 2).join(" "); return first.length > 3 && t.includes(first); });
  let prop = named ?? byStreet ?? (ctx.state.last_property_id ? props.find((p) => p.id === ctx.state.last_property_id) : undefined);
  if (!prop && props.length > 1) { const picked = await pickProperty(ctx, text, (addr) => `${text.replace(/[.!?\s]+$/, "")} for ${addr}`); if ("ask" in picked) return picked.ask; prop = picked.prop; }
  if (!prop && props.length === 1) prop = props[0];
  if (!prop) return reply("I don't have a listing saved yet to match against. Add one (for example “new listing 22 Elm Court Bethesda, 3 bed 2 bath, $650k”) and I'll find the buyers it fits.", [], "smalltalk");
  const buyers = (await ctx.store.list("contacts", ctx.userId)).filter((c) => ["buyer", "renter", "rental", "investor", "lead"].includes(c.type) && c.status !== "inactive");
  const city = (prop.city ?? "").toLowerCase();
  const scored = buyers.map((c) => {
    let score = 0; const why: string[] = [], miss: string[] = [];
    const pref = c.preferences ?? {};
    if (pref.beds_min != null && prop.beds != null) { if (prop.beds >= pref.beds_min) { score += 2; why.push(`${prop.beds} bd meets their ${pref.beds_min}+`); } else { score -= 3; miss.push(`wants ${pref.beds_min}+ bd`); } }
    if (c.budget_max != null && prop.list_price != null) { if (prop.list_price <= c.budget_max) { score += 3; why.push(`within their ${money(c.budget_max)} budget`); } else if (prop.list_price <= c.budget_max * 1.08) { score += 1; why.push(`just over their ${money(c.budget_max)} budget`); } else { score -= 4; miss.push(`budget ${money(c.budget_max)}`); } }
    if (c.budget_min != null && prop.list_price != null && prop.list_price < c.budget_min * 0.85) { score -= 1; miss.push("below their range"); }
    const loc = (c.location ?? "").toLowerCase();
    if (loc && city) { if (loc.includes(city) || city.includes(loc.split(",")[0].trim())) { score += 3; why.push(`wants ${prop.city}`); } else miss.push(`wants ${c.location}`); }
    if (pref.baths_min != null && prop.baths != null && prop.baths < pref.baths_min) { score -= 1; miss.push(`wants ${pref.baths_min}+ ba`); }
    return { c, score, why, miss };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  const addr = `${prop.address}${prop.city ? `, ${prop.city}` : ""}`;
  if (!scored.length) return reply(`None of your saved buyers clearly fit ${addr}${prop.list_price ? ` at ${fullMoney(prop.list_price)}` : ""}. I match on bedrooms, budget and area, so adding those to a person's profile makes this sharper.`, [], "chat_simple");
  return reply(`${plural(scored.length, "buyer")} fit ${addr}${prop.list_price ? ` (${fullMoney(prop.list_price)})` : ""}, best match first.`, [{
    type: "contacts", title: "Best matches", contacts: scored.map(({ c, why, miss }) => ({ id: c.id, name: c.name, type: label(c.type), reason: [...why, ...miss.map((m) => `but ${m}`)].join("; ") || undefined, color: c.avatar_color })),
    buttons: [{ label: "Draft a note to the top match", style: "primary", action: { type: "prompt", text: `Draft an email to ${scored[0].c.name} about ${prop.address}` } }, { label: "Email all of them", style: "secondary", action: { type: "prompt", text: `Draft an email to my buyers about ${prop.address}` } }],
  }], "chat_simple");
}

export async function findContactsHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const t = text.toLowerCase();
  if (/\bmatch\b.*\b(listing|home|property|house)\b|\bwho\b.*\b(?:would|might|should|could|wants?)\b.*\b(?:like|want|interested|send|show|fit)\b.*\b(?:listing|home|house|property|\d{1,6}\s+[a-z])/.test(t)) { const m = await matchBuyersHandler(ctx, text); if (m) return m; }
  const types: ContactType[] = [];
  if (/buyers?/.test(t)) types.push("buyer");
  if (/sellers?/.test(t)) types.push("seller");
  if (/leads?/.test(t)) types.push("lead");
  if (/investors?/.test(t)) types.push("investor");
  if (/renters?|rental/.test(t)) types.push("rental");
  if (/past clients?/.test(t)) types.push("past_client");
  const loc = parseLocation(text);
  const names = capitalisedNames(text);
  let list = ((await TOOLS.search_contacts.run(ctx, { types: types.length ? types : undefined, query: loc ?? undefined })) as any).data.contacts as Contact[];
  if (!types.length && !loc && names.length) {
    const hit = ((await TOOLS.get_contact.run(ctx, { name: names[0] })) as any);
    if (hit.ok) list = hit.data.contacts;
  }
  if (!list.length) return reply("I didn't find anyone matching that.");
  return reply(`I found ${plural(list.length, "person", "people")}.`, [{ type: "contacts", title: "Contacts", contacts: list.slice(0, 12).map((c) => ({ id: c.id, name: c.name, type: label(c.type), reason: c.next_action ?? undefined, color: c.avatar_color })), buttons: [{ label: "Open Contacts", style: "secondary", href: "/contacts" }] }]);
}

/** Contacts named in free text (case-insensitive). Full-name matches win; otherwise unique first-name matches. */
export async function mentionedContacts(ctx: Ctx, text: string): Promise<Contact[]> {
  const t = text.toLowerCase();
  const all = (await ctx.store.list("contacts", ctx.userId)).filter((c) => !isStopName(c.name)); // an old junk contact ("Add", "Turn") can never be mistaken for someone mentioned
  const full = all.filter((c) => t.includes(c.name.toLowerCase()));
  if (full.length) return full;
  const words = new Set(t.replace(/['’]s\b/g, "").split(/[^a-z0-9'’-]+/).filter((w) => w.length >= 3)); // "Priya's number" names Priya
  const stop = new Set(["who", "the", "and", "for", "all", "tell", "about", "what", "contact", "contacts", "buyer", "seller", "lead", "client", "test"]);
  const shortNames = new Set([...text.matchAll(/(?<![\p{L}])(\p{Lu}\p{Ll})(?![\p{L}])/gu)].map((m) => m[1].toLowerCase())); // "Li", "Mc": only when written as a name
  const byFirst = all.filter((c) => { const f = firstNameOf(c.name).toLowerCase(); return (f.length >= 3 ? words.has(f) : shortNames.has(f)) && !stop.has(f); });
  // a full name was typed ("QA TEST Dana Lee") and nobody has it: a different person who shares the first name is NOT that person
  const typedFull = capitalisedNames(text).map((n) => n.split(/\s+/).map((w) => w.replace(/['’]s$/i, "")).filter((w) => !/^[A-Z]{2,5}$/.test(w))).filter((w) => w.length >= 2);
  if (!typedFull.length) return byFirst;
  return byFirst.filter((c) => !typedFull.some((w) => w[0].toLowerCase() === firstNameOf(c.name).toLowerCase() && w[w.length - 1].toLowerCase() !== c.name.toLowerCase().split(/\s+/).pop()));
}

export async function recallHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const found = await mentionedContacts(ctx, text);
  const wantsEmail = /\b(e-?mail)\b/i.test(text), wantsPhone = /\b(phone|number|cell|mobile)\b/i.test(text), wantsBudget = /\bbudget\b/i.test(text);
  // "What's Victor's phone, email and budget?": every field asked for gets an answer, and a missing one says "not saved"
  if (found.length === 1 && wantsBudget && (wantsEmail || wantsPhone)) {
    const c = found[0];
    const bits = [wantsPhone ? (c.phone ? `phone ${c.phone}` : "no phone saved") : null, wantsEmail ? (c.email ? `email ${c.email}` : "no email saved") : null, `${c.type === "seller" ? "asking" : "budget"} ${c.budget_max ? fullMoney(c.budget_max) : "not saved"}`].filter(Boolean);
    ctx.state.last_contact_ids = [c.id]; await persistState(ctx);
    return reply(`${c.name}: ${bits.join(" · ")}.`, [{ type: "contacts", title: c.name, contacts: [{ id: c.id, name: c.name, type: label(c.type), reason: c.location ?? undefined, color: c.avatar_color }], buttons: [{ label: "Open profile", style: "quiet", href: `/contacts/${c.id}` }] }], "chat_simple");
  }
  if (found.length === 1 && (wantsEmail || wantsPhone)) {
    const c = found[0];
    const bits = [wantsPhone ? (c.phone ? `phone ${c.phone}` : null) : null, wantsEmail ? (c.email ? `email ${c.email}` : null) : null].filter(Boolean);
    const missing = [wantsPhone && !c.phone ? "phone number" : null, wantsEmail && !c.email ? "email" : null].filter(Boolean);
    ctx.state.last_contact_ids = [c.id];
    return reply(`${bits.length ? `${c.name}: ${bits.join(" · ")}.` : ""}${missing.length ? `${bits.length ? " " : ""}I don't have a ${missing.join(" or ")} for ${c.name} yet. Tell me and I'll save it.` : ""}`, [{ type: "contacts", title: c.name, contacts: [{ id: c.id, name: c.name, type: label(c.type), color: c.avatar_color }], buttons: [{ label: "Open profile", style: "secondary", href: `/contacts/${c.id}` }] }], "smalltalk");
  }
  if (found.length === 1) {
    const c = found[0];
    const facts = await contactFacts(ctx, c);
    const line = [label(c.type), label(c.status), c.location].filter(Boolean).join(" · ");
    return reply(`${c.name} — ${line}.${facts.length ? `\n${facts.map((f) => `• ${f}`).join("\n")}` : "\nI don't have more details yet."}${c.next_action ? `\nNext: ${c.next_action}` : ""}`, [{ type: "contacts", title: c.name, contacts: [{ id: c.id, name: c.name, type: label(c.type), color: c.avatar_color }], buttons: [{ label: "Open profile", style: "secondary", href: `/contacts/${c.id}` }] }]);
  }
  if (found.length > 1) return reply(`I have ${found.length} people who match.`, [{ type: "contacts", title: "Which one?", contacts: found.slice(0, 8).map((c) => ({ id: c.id, name: c.name, type: label(c.type), reason: c.location ?? undefined, color: c.avatar_color })) }]);
  const names = capitalisedNames(text);
  if (names.length) return reply(`I don't have anyone named ${names[0]} in your contacts yet. Want me to add them?`);
  const mem = (await listMemories(ctx)).filter((m) => m.scope === "user" || m.scope === "business");
  return reply(mem.length ? `Here's what I remember about you and how you work:\n${mem.slice(0, 8).map((m) => `• ${m.key}: ${m.value}`).join("\n")}` : "I don't have anything saved yet. Tell me things worth remembering — preferences, how you like emails written — and I'll keep them. You can review everything in More → Memory.");
}

export async function deleteHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  if (/\b(all|every|everyone|everything)\b/i.test(text)) {
    return reply("I won't delete in bulk from chat — it's too easy to get wrong and can't be undone.", [{ type: "notice", tone: "warn", title: "Deleting is always one at a time", body: "To remove one person, say “delete” and their name. To wipe your whole account, use More → Privacy → Delete all my data.", buttons: [{ label: "Open Contacts", style: "secondary", href: "/contacts" }] }], "smalltalk");
  }
  const found = await mentionedContacts(ctx, text);
  if (!found.length) return reply("Who should I delete? Give me their name.", [], "smalltalk");
  if (found.length > 1) return reply("Which one?", [{ type: "choice", title: "Which contact?", buttons: found.slice(0, 5).map((c) => ({ label: c.name, style: "secondary" as const, action: { type: "prompt", text: `delete ${c.name}` } })) }], "smalltalk");
  const out = await invoke(ctx, "delete_contact", { id: found[0].id });
  if (out.status === "needs_approval") return reply("Deleting always needs your confirmation.", [{ type: "notice", tone: "warn", title: out.approval.title, body: out.approval.summary ?? undefined, buttons: [{ label: "Confirm delete", style: "primary", approvalId: out.approval.id }, { label: "Keep them", style: "quiet", action: { type: "noop" } }] }], "smalltalk");
  return reply(out.result.ok ? "Deleted." : out.result.message, [], "smalltalk");
}

export async function saveMemoryHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const body = text.replace(/^.*?\b(?:remember(?: that)?|note that|keep in mind(?: that)?|going forward|from now on|from here on(?: out)?)\b[:,]?\s*/i, "").trim();
  if (!body) return reply("What should I remember?");
  const names = capitalisedNames(body);
  let subject: Contact | null = null;
  for (const n of names) { const r = (await TOOLS.get_contact.run(ctx, { name: n })) as any; if (r.ok && r.data.contacts.length === 1) { subject = r.data.contacts[0]; break; } }
  const m = await saveMemory(ctx, { scope: subject ? "contact" : "user", subject_id: subject?.id ?? null, key: subject ? "Note" : "Preference", value: body, source: "user_stated" });
  if (subject) await TOOLS.update_contact.run(ctx, { id: subject.id, patch: {}, eventTitle: "Note saved", eventDetail: body, eventKind: "note" });
  return reply(subject ? `Saved to ${subject.name}'s profile: “${body}”` : `Remembered: “${body}”. You can see or edit it in More → Memory.`, [], "chat_simple");
  void m;
}

export async function findPropertyForContactHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const names = capitalisedNames(text);
  const state = ctx.state.last_contact_ids?.[0];
  let c: Contact | null = null;
  for (const n of names) { const r = (await TOOLS.get_contact.run(ctx, { name: n })) as any; if (r.ok) { c = r.data.contacts[0]; break; } }
  if (!c && state) c = await ctx.store.get("contacts", ctx.userId, state);
  if (!c) return reply("Which client should I look for homes for? Tell me their name, or what they want (beds, area, budget).", [], "smalltalk");
  const facts = await contactFacts(ctx, c);
  // With a live listing feed connected, actually search it with this person's saved criteria.
  const { rentcastConfigured } = await import("../../listing-data/rentcast");
  if (rentcastConfigured()) {
    const { extractPlace } = await import("../property-lookup");
    const { newListingsHandler } = await import("./marketdata");
    const home = extractPlace(ctx.profile.location ?? ctx.profile.primary_market ?? "");
    const loc = c.location ? (extractPlace(c.location).state ? c.location : `${c.location}${home.state ? `, ${home.state}` : ""}`) : "";
    if (!loc) return reply(`Which city or ZIP should I search for ${firstName(c.name)}? I'll save it to their profile.`, [], "smalltalk");
    const pref = c.preferences ?? {};
    const q = ["Show me the newest", pref.property_types?.[0] ?? "listings", `in ${loc}`, pref.beds_min ? `with ${pref.beds_min}+ bedrooms` : "", c.budget_max ? `under $${c.budget_max}` : "", "from the last 30 days"].filter(Boolean).join(" ");
    const r = await newListingsHandler(ctx, q);
    return { ...r, text: `Searching for ${firstName(c.name)} (${facts.join(" • ") || "no saved criteria yet"}). ${r.text}` };
  }
  return reply(`Here's what I'll use for ${firstName(c.name)}: ${facts.join(" • ") || "no saved criteria yet"}.\n\nListing search needs an MLS or listing-data connection, which isn't set up yet — so I can't pull live listings. I don't want to guess at homes.`, [{
    type: "choice", title: `Next steps for ${firstName(c.name)}`,
    buttons: [
      { label: "Remind me to send listings", style: "primary", action: { type: "quick_task", contactId: c.id, title: `Send listings to ${firstName(c.name)}`, subtitle: facts.join(" • ") } },
      { label: "Open profile", style: "secondary", href: `/contacts/${c.id}` },
    ],
  }]);
}

export type { DocumentTemplate, Block };
export { pickColor, fmtDayTime };


/** "Update Ana's phone to 512-555-0299": change one saved field, say what it was, and read it back. */
export async function contactFieldUpdateHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const field = /\b(phone|number|cell|mobile|email|e-?mail|budget|location|area|city)\b/i.exec(text)?.[1]?.toLowerCase() ?? "";
  let found = await mentionedContacts(ctx, text);
  // "bump her budget to 600k": her/his/their is the person we were just talking about
  if (!found.length && /\b(?:her|his|their)\b/i.test(text) && ctx.state.last_contact_ids?.length === 1) { const c0 = await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]); if (c0) found = [c0]; }
  if (found.length !== 1) return reply(found.length ? `Which one: ${found.slice(0, 4).map((c) => c.name).join(", ")}?` : "Which contact is that for? Tell me their name.", [], "smalltalk");
  const c = found[0];
  // one message can change several fields: "phone to X and email to Y", "budget to 550k and add Brookeville"
  const patch: Partial<Contact> = {}; const done: string[] = [];
  const hasPhone = /\b(?:phone|number|cell|mobile)\b/i.test(text), hasMail = /\be-?mail\b/i.test(text) || !!parseEmail(text), hasBudget = /\bbudget\b/i.test(text);
  if (hasPhone) { const v = parsePhone(text) ?? /\b(?:phone|number|cell|mobile)\b(?:\s*(?:to|is|=|:|as))?\s*(\d{3}[\s.-]?\d{4})\b/i.exec(text)?.[1]?.replace(/[\s.]/g, "-") ?? null; if (v) { patch.phone = v; done.push(`phone to ${v}${c.phone ? ` (was ${c.phone})` : ""}`); } }
  if (hasMail) { const v = parseEmail(text); if (v) { patch.email = v; done.push(`email to ${v}${c.email ? ` (was ${c.email})` : ""}`); } }
  if (hasBudget) { const v = parseMoney(text).max; if (v) { patch.budget_max = v; done.push(`budget to ${fullMoney(v)}${c.budget_max ? ` (was ${fullMoney(c.budget_max)})` : ""}`); } }
  const addArea = /\badd\s+((?:[A-Z][\w.'-]+)(?:\s+[A-Z][\w.'-]+){0,2})(?=\s*(?:[,.;!?]|$|\bto\b|\bas\b|\band\b))/.exec(text);
  if (addArea && (hasBudget || /\b(?:area|areas|location|looking in|search)\b/i.test(text)) && !/\bnote\b/i.test(text) && addArea[1].toLowerCase() !== c.name.split(" ")[0].toLowerCase()) {
    const have = (c.location ?? "").split(/;\s*/).filter(Boolean);
    if (!have.some((x) => x.toLowerCase().startsWith(addArea[1].toLowerCase()))) { patch.location = [...have, addArea[1]].join("; "); done.push(`search area: added ${addArea[1]}${c.location ? ` (now ${patch.location})` : ""}`); }
  } else if (!hasPhone && !hasMail && !hasBudget || /\b(?:location|area|city)\s+(?:to|is)\b/i.test(text)) { const v = parseLocation(text); if (v) { patch.location = v; done.push(`area to ${v}${c.location ? ` (was ${c.location})` : ""}`); } }
  if (!done.length) return reply(`What should ${firstName(c.name)}'s ${field === "number" || field === "cell" || field === "mobile" ? "phone" : field} be? I didn't catch a value, so I haven't changed anything.`, [], "smalltalk");
  const out = await TOOLS.update_contact.run(ctx, { id: c.id, patch, eventTitle: "Details updated", eventDetail: done.join("; "), eventKind: "note" }) as any;
  const saved = out?.ok ? await ctx.store.get("contacts", ctx.userId, c.id) : null;
  if (!saved || (Object.keys(patch) as (keyof Contact)[]).some((k) => saved[k] == null)) return reply(`I couldn't save that for ${c.name}. Nothing was changed.`, [], "smalltalk");
  // the saved search follows the new budget, so the profile never shows two different budgets
  if (patch.budget_max) {
    for (const m of await listMemories(ctx, { scope: "contact", subject_id: c.id })) {
      if (/^(?:search|selling) criteria$/i.test(m.key) && /~\$[\d,]+/.test(m.value)) await saveMemory(ctx, { scope: "contact", subject_id: c.id, key: m.key, value: m.value.replace(/~\$[\d,]+/, `~${fullMoney(patch.budget_max)}`), source: "user_stated" });
    }
  }
  ctx.state.last_contact_ids = [c.id]; await persistState(ctx);
  return reply(`Updated ${c.name}: ${done.join("; ")}.`, [], "chat_simple");

}


/** The person this message is about: a full name in the message itself, else the latest full name said earlier in this chat. */
async function nameFromChat(ctx: Ctx, text: string): Promise<string | null> {
  const full = (t: string) => capitalisedNames(t).filter((n) => n.includes(" ") && plausibleName(n)).pop();
  const here = full(text) ?? capitalisedNames(text).find((n) => plausibleName(n) && !/^(?:Add|Corinne)$/.test("") && true);
  if (here) return here;
  const msgs = (await ctx.store.list("messages", ctx.userId)).filter((m) => m.conversation_id === ctx.conversationId && m.role === "user").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);
  for (const m of msgs) { const n = full(m.content); if (n) return n; }
  return null;
}


/** "Add Grant Abernathy as a related contact for Corinne" / "add Grant as her son": a new person, linked to the client they belong to. */
export async function relatedContactHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const W = "\\p{Lu}[\\p{L}'’-]*";
  const m = new RegExp(`[Aa]dd\\s+(${W}(?:\\s+${W}){0,2})\\s+as\\s+(?:a\\s+)?(?:related\\s+contact\\s+(?:for|of|to)\\s+(${W}(?:\\s+${W}){0,2})|(?:her|his|their)\\s+(son|daughter|husband|wife|partner|spouse|mother|father|brother|sister|assistant|attorney|lawyer|accountant))`, "u").exec(text);
  if (!m || !plausibleName(m[1])) return reply("Who is the new contact, and who are they related to? For example: “Add Grant Abernathy as a related contact for Corinne.”", [], "smalltalk");
  const name = m[1];
  const rel = m[3] ?? "related contact";
  const owners = await mentionedContacts(ctx, m[2] ?? text.replace(m[1], " "));
  const owner = owners.length === 1 ? owners[0] : ctx.state.last_contact_ids?.length === 1 && !m[2] ? await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]) : null;
  if (!owner) return reply(`Who is ${name} related to? I need the client's name so I can link them.`, [], "smalltalk");
  const out = (await TOOLS.create_contact.run(ctx, { name, type: "lead", status: "new", source: `Related to ${owner.name}`, notes: `${rel === "related contact" ? "Related contact" : `${owner.name}'s ${rel}`} (${owner.name})` })) as any;
  const made = out?.ok ? out.data.contact : null;
  if (!made) return reply(`I couldn't add ${name}, so nothing was saved.`, [], "smalltalk");
  if (out.data.existing) return reply(`${made.name} is already in your contacts. I haven't added a second one.`, [{ type: "choice", title: made.name, buttons: [{ label: "Open profile", style: "secondary", href: `/contacts/${made.id}` }] }], "smalltalk");
  await saveMemory(ctx, { scope: "contact", subject_id: made.id, key: "Related to", value: `${owner.name}${rel === "related contact" ? "" : ` (${rel})`}`, source: "user_stated" });
  await saveMemory(ctx, { scope: "contact", subject_id: owner.id, key: "Related contact", value: `${made.name}${rel === "related contact" ? "" : ` (${rel})`}`, source: "user_stated" });
  ctx.state.last_contact_ids = [owner.id]; await persistState(ctx);
  return reply(`Added ${made.name}${rel === "related contact" ? "" : ` as ${owner.name}'s ${rel}`}, linked to ${owner.name}. Nothing is sent to them.`, [{ type: "choice", title: made.name, buttons: [{ label: "Open profile", style: "secondary", href: `/contacts/${made.id}` }, { label: `Open ${firstName(owner.name)}`, style: "quiet", href: `/contacts/${owner.id}` }] }], "chat_simple");
}

const FACT_CUES: RegExp[] = [
  /\b(?:budget|max(?:imum)? (?:rent|price|budget)|under|up to|pre-?approved)\b[^.;]{0,25}(?:\$\s?\d|\b\d[\d,.]*\s?[km]\b)/i,
  /\b(?:near|close to|around|in)\s+[A-Z][\p{L}.'’ -]{2,30}/u,
  /\b(?:moving|move-?in|moves|relocating|closing|lease (?:ends|expires))\b/i,
  /\b(?:has|have|with)\s+(?:an?\s+|two\s+|\d+\s+)?(?:cat|dog|pet|kid|child|children|baby)s?\b/i,
  /\bphone(?: number)?\b[^.]{0,6}\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/i,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,
  /\b(?:wants?|needs?|looking for)\s+(?:a\s+|an\s+)?\d*\s?(?:bed|bd|br|bath|ba|garage|yard|parking)/i,
];
export const factCueCount = (text: string): number => FACT_CUES.filter((r) => r.test(text)).length + (/^\s*(?:(?:ok|and|also|so)[,\s]+)*(?:she|he|they)(?:'s|'ll| is| are| has| have| wants?| also)\b/i.test(text) && FACT_CUES.some((r) => r.test(text)) ? 1 : 0); // "she's also pre-approved for 500k": one fact about the person just discussed is enough

/** "Her budget is under $3,200/month, she wants to be near Bethesda Metro, she's moving Dec 1 and has a cat. Phone is 240-555-0142": one person, several facts, one clean save. Returns null when it can't tell who it is about. */
export async function contactFactsHandler(ctx: Ctx, text: string): Promise<HandlerOut | null> {
  if (/\?\s*$/.test(text) || /\n/.test(text) || factCueCount(text) < 2) return null;
  // budget and wants alone belong to the older learn flow (it also flags a contradiction like a "seller" who is pre-approved); this handles the rest
  const pronounLead = /^\s*(?:(?:ok|and|also|so)[,\s]+)*(?:she|he|they|her|his|their)\b/i.test(text);
  if (!pronounLead && ![1, 2, 3, 4, 5].some((i) => FACT_CUES[i].test(text))) return null;
  // a call, meeting or visit being reported is a log entry (handled by the interaction flow), not a profile edit
  if (/\b(?:just )?(?:got off|hung up|spoke (?:to|with)|talked (?:to|with)|met with|ran into|came by|stopped by|called|texted|emailed)\b/i.test(text)) return null;
  if (/^\s*(?:draft|write|email|text|send|schedule|remind|add a|create|make|book|set up)\b/i.test(text) || /\b\d{1,2}(?::\d\d)?\s?(?:am|pm)\b/i.test(text)) return null;
  const named = (await mentionedContacts(ctx, text)).filter((c) => c.status !== "inactive");
  const pron = /^\s*(?:(?:ok|and|also|so)[,\s]+)*(?:her|his|their|she|he|they)\b/i.test(text) || /\b(?:she|he)(?:'s|'ll| is| has| wants)\b/i.test(text);
  let c = named.length === 1 ? named[0] : null;
  if (!c && !named.length && pron && ctx.state.last_contact_ids?.[0]) c = await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]);
  if (!c) return null;
  const patch: Partial<Contact> = {};
  const saved: string[] = [];
  const phone = parsePhone(text); if (phone && phone !== c.phone) { patch.phone = phone; saved.push(`Phone: ${phone}`); }
  const email = parseEmail(text); if (email && email !== c.email) { patch.email = email; saved.push(`Email: ${email}`); }
  const bm = /\b(?:budget|max(?:imum)?(?: rent| price| budget)?|under|up to|pre-?approved(?: for)?)\b[^.;]{0,25}?(\$?\s?\d[\d,.]*\s?(?:k|m)?)\b/i.exec(text);
  if (bm) { const v = parseMoney(bm[1]).max; if (v) { patch.budget_max = v; const rent = /\brent|\/\s?mo|per month|month\b/i.test(bm[0] + text.slice(text.indexOf(bm[0]), text.indexOf(bm[0]) + bm[0].length + 12)); saved.push(`${rent ? "Max rent" : "Budget"}: ${fullMoney(v)}${rent ? "/month" : ""}`); if (rent && c.type === "buyer") patch.type = "rental"; }
  }
  const near = /\b(?:near|close to)\s+([A-Z][\p{L}.'’ -]{2,40}?)(?=[,.;]|\s+(?:and|but|she|he|they)\b|$)/u.exec(text);
  if (near) { saved.push(`Area: near ${near[1].trim()}`); await saveMemory(ctx, { scope: "contact", subject_id: c.id, key: "Area", value: `near ${near[1].trim()}`, source: "user_stated" }); if (!c.location) patch.location = near[1].trim(); }
  const mv = /\b(?:moving|move-?in|moves|relocating)\b[^,.;]{0,30}/i.exec(text);
  if (mv) { const t = mv[0].trim().replace(/^moving\s+/i, "moving ").replace(/^move-?in\s*/i, "move-in "); patch.timeline = t.slice(0, 60); saved.push(`Timing: ${t}`); }
  const pet = /\b(?:has|have|with)\s+(?:an?\s+|two\s+|\d+\s+)?(cats?|dogs?|pets?|kids?|children|baby)\b/i.exec(text);
  if (pet) { saved.push(`Household: ${/pet|cat|dog/i.test(pet[1]) ? "has a " : "has "}${pet[1].toLowerCase()}`.replace("has a pets", "has pets")); await saveMemory(ctx, { scope: "contact", subject_id: c.id, key: /cat|dog|pet/i.test(pet[1]) ? "Pets" : "Household", value: pet[1].toLowerCase(), source: "user_stated" }); }
  if (!saved.length) return null;
  if (Object.keys(patch).length) await TOOLS.update_contact.run(ctx, { id: c.id, patch, eventTitle: "Details updated", eventDetail: saved.join("; "), eventKind: "note" });
  ctx.state.last_contact_ids = [c.id]; await persistState(ctx);
  return reply(`Saved to ${firstNameOf(c.name)}'s profile:\n${saved.map((x) => `• ${x}`).join("\n")}`, [{ type: "choice", title: `Next for ${firstNameOf(c.name)}`, buttons: [{ label: "Open profile", style: "quiet", href: `/contacts/${c.id}` }] }], "chat_simple");
}

/** "Hollis & Mae Brandt closed on their home two years ago and might refer a friend": they are past clients; the note and the referral hint are saved on them. */
export async function pastClientNoteHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const people = await mentionedContacts(ctx, text);
  if (people.length !== 1) {
    const nm = capitalisedNames(text)[0];
    return reply(people.length > 1 ? `Which one: ${people.slice(0, 4).map((c) => c.name).join(", ")}?` : `I don't have ${nm ?? "them"} saved yet. Say “add ${nm ?? "their name"} as a past client” and I'll save this on them.`, [], "smalltalk");
  }
  const c = people[0];
  const when = /\b(\d+|a|one|two|three|four|five|last|several|a few)\s+(years?|months?)\s+ago\b/i.exec(text)?.[0] ?? null;
  const refers = /\b(?:might|may|could|will|would)\s+refer\b|\brefer(?:s|ral)?\b/i.test(text);
  const patch: Partial<Contact> = { tags: [...new Set([...(c.tags ?? []), "past client"])] };
  if (["seller", "buyer", "lead"].includes(c.type)) patch.type = "past_client";
  await TOOLS.update_contact.run(ctx, { id: c.id, patch, eventTitle: "Marked as a past client", eventDetail: text.slice(0, 200), eventKind: "note" });
  await ctx.store.insert("contact_notes", ctx.userId, { contact_id: c.id, body: text.replace(/\s+/g, " ").slice(0, 400) } as never);
  if (when) await saveMemory(ctx, { scope: "contact", subject_id: c.id, key: "Closed", value: when, source: "user_stated" });
  if (refers) await saveMemory(ctx, { scope: "contact", subject_id: c.id, key: "Referral", value: "may refer a friend", source: "user_stated" });
  ctx.state.last_contact_ids = [c.id]; await persistState(ctx);
  return reply(`Saved to ${c.name}: past client${when ? `, closed ${when}` : ""}${refers ? ", may refer a friend" : ""}.`, [{ type: "choice", title: "Next", buttons: [{ label: "Set an anniversary reminder", style: "secondary", action: { type: "prompt", text: `Make a home-anniversary post for ${c.name}` } }, { label: "Open profile", style: "quiet", href: `/contacts/${c.id}` }] }], "chat_simple");
}

/** "I'm meeting a new buyer couple, the Alvarezes, Friday at 2pm. Budget around $520k in Rockville, close to I-270": one saved household with what was said, and the meeting on the calendar. */
export async function newClientMeetingHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const type = /\bseller|listing appointment\b/i.test(text) ? "seller" : /\brenter|tenant\b/i.test(text) ? "renter" : "buyer";
  let surname = "";
  const plural = /\bthe\s+(\p{Lu}[\p{L}'’-]{3,})\b/u.exec(text);
  if (plural && /s$/i.test(plural[1])) surname = /(?:zes|ses|xes|ches|shes)$/i.test(plural[1]) ? plural[1].slice(0, -2) : plural[1].slice(0, -1);
  else if (plural) surname = plural[1];
  const named = /\b(?:named|called|name is)\s+(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?)/u.exec(text)?.[1];
  const name = named ?? (surname ? `${surname} Family` : "");
  if (!name) return reply("What's their name? Tell me and I'll save them and put the meeting on your calendar.", [], "smalltalk");
  const budget = /\bbudget\b/i.test(text) ? parseMoney(text).max : null;
  const loc = parseLocation(text.replace(/\bclose to\b/gi, "near"));
  const near = /\b(?:close to|near|by)\s+((?:the\s+)?[A-Za-z0-9][\w\- ]{1,30}?)(?=\s*(?:[,.;!?]|$|\band\b|\bwith\b|\bfor\b))/i.exec(text)?.[1]?.trim();
  const out = await TOOLS.create_contact.run(ctx, { name, type, status: "new", budget_max: budget ?? null, location: loc ?? null, source: "Meeting", notes: null }) as any;
  const contact = out?.ok ? out.data.contact : null;
  if (!contact) return reply(`I couldn't save ${name}, so nothing was changed.`, [], "smalltalk");
  if (near && !out.data.existing) await saveMemory(ctx, { scope: "contact", subject_id: contact.id, key: "Wants to be near", value: near.replace(/^the\s+/i, ""), source: "user_stated" });
  if (budget && !out.data.existing) await saveMemory(ctx, { scope: "contact", subject_id: contact.id, key: "Budget", value: `around ${fullMoney(budget)}`, source: "user_stated" });
  ctx.state.last_contact_ids = [contact.id]; await persistState(ctx);
  const when = /\b(?:today|tomorrow|tonight|(?:this |next |on )?(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)[a-z]*)\b(?:\s+(?:at|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i.exec(text)?.[0] ?? "";
  const saved = `${out.data.existing ? `${contact.name} was already saved` : `Saved ${contact.name} as a new ${type}`}${budget ? `, budget around ${fullMoney(budget)}` : ""}${loc ? `, looking in ${loc}` : ""}${near ? `, wants to be near ${near.replace(/^the\s+/i, "")}` : ""}.`;
  if (!when) return reply(`${saved} When is the meeting?`, [], "smalltalk");
  const { createEventHandler } = await import("./calendar");
  const ev = await createEventHandler(ctx, `Schedule a meeting with ${contact.name} ${when}`, "meeting", `Meeting with ${contact.name}`, contact.id);
  return { ...ev, text: `${saved}\n${ev.text}` };
}

/** "What's their budget again?" / "What did I say they wanted to be close to?": the person just talked about, answered from what is saved about them. */
export async function contactQuestionHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const named = await mentionedContacts(ctx, text);
  const c = named.length === 1 ? named[0] : ctx.state.last_contact_ids?.[0] ? await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]) : null;
  if (!c) return reply("Who do you mean? Tell me their name.", [], "smalltalk");
  const first = firstName(c.name);
  const t = text.toLowerCase();
  const direct: string[] = [];
  if (/\bbudget\b/.test(t)) direct.push(c.budget_max ? `${first}'s budget is ${c.budget_min ? `${fullMoney(c.budget_min)} to ` : "around "}${fullMoney(c.budget_max)}.` : `I don't have a budget saved for ${c.name}.`);
  if (/\b(?:phone|number|cell)\b/.test(t)) direct.push(c.phone ? `${first}'s phone is ${c.phone}.` : `I don't have a phone number for ${c.name}.`);
  if (/\be-?mail\b/.test(t)) direct.push(c.email ? `${first}'s email is ${c.email}.` : `I don't have an email for ${c.name}.`);
  if (/\b(?:area|areas|location|where|looking in)\b/.test(t) && !/\b(?:close|near)\b/.test(t)) direct.push(c.location ? `${first} is looking in ${c.location}.` : `I don't have an area saved for ${c.name}.`);
  if (direct.length) return reply(direct.join(" "), [], "chat_simple");
  const facts = await contactFacts(ctx, c);
  const words = (t.match(/[a-z]{4,}/g) ?? []).filter((w) => !/^(?:what|that|they|them|their|wanted|want|said|tell|remind|about|have|does|were|with|again|close)$/.test(w));
  const hits = facts.filter((f) => words.some((w) => f.toLowerCase().includes(w.slice(0, 5))) || (/\b(?:close|near)\b/.test(t) && /\bnear\b/i.test(f)));
  if (hits.length) return reply(`${first}: ${hits.slice(0, 4).join("; ")}.`, [], "chat_simple");
  return reply(facts.length ? `I don't have that saved for ${first}. What I do have: ${facts.slice(0, 5).join("; ")}.` : `I don't have anything saved for ${first} yet.`, [], "chat_simple");
}
