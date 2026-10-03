import { addDays, fmtDayTime, partsIn, zonedToUtc } from "../../time";
import type { Block, Contact, ContactType, DocumentTemplate, WorkflowRun } from "../../types";
import { type Ctx, firstName, fullMoney, label, money, pickColor, plural } from "../context";
import { persistState } from "../conversation";
import { buildDebrief, greetingFor } from "../debrief";
import { contactFacts, listMemories, saveMemory } from "../memory";
import { capitalisedNames, parseBaths, parseBeds, parseContactType, parseEmail, parseLocation, parseMoney, parsePersonName, parsePhone, parseTimeline } from "../nlu";
import { computePriorities } from "../prioritize";
import { TOOLS, invoke } from "../tools";
import { type HandlerOut, reply } from "./types";

const FEATURES: [RegExp, string][] = [[/garage/i, "Garage"], [/\bpool\b/i, "Pool"], [/yard|fenced/i, "Yard"], [/basement/i, "Basement"], [/new construction/i, "New construction"], [/single[- ]family/i, "Single-family"], [/town ?(home|house)/i, "Townhome"], [/condo/i, "Condo"], [/main[- ]level|first[- ]floor/i, "Main-level living"], [/good schools?|school district/i, "Good schools"], [/commut/i, "Short commute"]];

const WORKFLOW_BY_TYPE: Record<string, { key: string; kicker: string }> = {
  buyer: { key: "new_buyer", kicker: "NEW BUYER" }, seller: { key: "new_seller", kicker: "NEW SELLER" }, rental: { key: "new_rental", kicker: "NEW RENTAL CLIENT" },
  investor: { key: "investor", kicker: "NEW INVESTOR" }, lead: { key: "new_lead", kicker: "NEW LEAD" }, past_client: { key: "past_client", kicker: "PAST CLIENT" },
};

export async function newContactHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const name = parsePersonName(text);
  if (!name) {
    ctx.state.pending = { kind: "clarify", intent: "new_contact", slots: { text }, missing: "name" };
    await persistState(ctx);
    return reply("What's their name?");
  }
  const type = (parseContactType(text) ?? "lead") as ContactType;
  const money$ = parseMoney(text);
  const beds = parseBeds(text), baths = parseBaths(text);
  const features = FEATURES.filter(([re]) => re.test(text)).map(([, f]) => f);
  const location = parseLocation(text);
  const timeline = parseTimeline(text);
  const email = parseEmail(text), phone = parsePhone(text);

  const wf = WORKFLOW_BY_TYPE[type] ?? WORKFLOW_BY_TYPE.lead;
  const plan: WorkflowRun["plan"] = [];
  const run = await ctx.store.insert("workflow_runs", ctx.userId, { workflow_key: wf.key, title: name, subtitle: null, status: "running", params: { text }, plan: [], outputs: {} });

  const out = await invoke(ctx, "create_contact", {
    name, type, email, phone, location, timeline, budget_max: money$.max, budget_min: money$.min,
    preferences: { ...(beds ? { beds_min: beds } : {}), ...(baths ? { baths_min: baths } : {}), ...(features.length ? { features } : {}) },
    status: "new", source: "Mila", next_action: "Intro call / confirm search criteria", next_action_at: new Date(ctx.now.getTime() + 24 * 3_600_000).toISOString(),
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
    if (location) patch.location = location;
    if (timeline) patch.timeline = timeline;
    if (money$.max) patch.budget_max = money$.max;
    if (money$.min) patch.budget_min = money$.min;
    const u = await TOOLS.update_contact.run(ctx, { id: contact.id, patch, eventTitle: "Details updated by Mila", eventKind: "note" });
    if (u.ok) contact = (u.data as any).contact;
  }
  plan.push({ label: existing ? `Updated ${firstName(name)}'s profile` : `Created ${label(type).toLowerCase()} profile`, tool: "create_contact", state: "done" });
  ctx.state.last_contact_ids = [contact.id];

  // memory: durable, structured, editable
  const crit = [beds && `${beds}+ bedrooms`, baths && `${baths}+ baths`, ...features, location, money$.max && `~${fullMoney(money$.max)}`, timeline && `Timeline: ${timeline}`].filter(Boolean).join(" • ");
  if (crit) {
    await saveMemory(ctx, { scope: "contact", subject_id: contact.id, key: type === "seller" ? "Selling criteria" : "Search criteria", value: crit, source: "user_stated" });
    plan.push({ label: "Saved search criteria", tool: "save_memory", state: "done", detail: crit });
  }

  // first follow-up
  const tmr = partsIn(addDays(ctx.now, 1, ctx.tz), ctx.tz);
  const due = zonedToUtc(tmr.y, tmr.m, tmr.d, 10, 0, ctx.tz).toISOString();
  const t = await invoke(ctx, "create_task", { kind: "follow_up", title: `Intro call with ${firstName(name)}`, subtitle: "Confirm criteria and book a consultation", due_at: due, contact_id: contact.id, workflow_run_id: run.id }, { runId: run.id });
  plan.push({ label: "First follow-up", tool: "create_task", state: t.status === "done" && t.result.ok ? "done" : "needs_approval", detail: "Tomorrow, 10:00 AM" });

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

  await ctx.store.update("workflow_runs", ctx.userId, run.id, { plan, status: "completed", subtitle: [money$.max && money(money$.max), location, timeline].filter(Boolean).join(" • ") || null });
  await persistState(ctx);
  return reply(existing ? `I already had ${name}, so I updated her record.`.replace("her", "their") : `Got it. ${name} is set up.`, [{
    type: "workflow", runId: run.id, kicker: wf.kicker, title: name, subtitle: [money$.max && money(money$.max), location, timeline].filter(Boolean).join(" • ") || label(type),
    items: plan.map((p) => ({ label: p.label, state: p.state, detail: p.detail })),
    buttons: [{ label: "Open profile", style: "primary", href: `/contacts/${contact.id}` }],
  }], "workflow_default");
}

export async function prioritiesHandler(ctx: Ctx): Promise<HandlerOut> {
  const pr = await computePriorities(ctx);
  if (!pr.length) return reply("You're all caught up. Nothing needs you right now.");
  const caps = { urgent: 3, important: 4, upcoming: 3, low: 0 } as const;
  const groups = (["urgent", "important", "upcoming"] as const).map((p) => ({
    priority: p,
    items: pr.filter((x) => x.priority === p && x.source !== "event").slice(0, caps[p]).map((x) => ({ id: x.id, title: x.title, subtitle: x.subtitle, reason: x.reason || undefined, href: x.contactId ? `/contacts/${x.contactId}` : x.taskId ? "/tasks" : undefined })),
  })).filter((g) => g.items.length);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (!total) return reply("Nothing needs follow-up right now.");
  const urgent = groups.find((g) => g.priority === "urgent")?.items.length ?? 0;
  return reply(urgent ? `${plural(urgent, "thing needs", "things need")} you first. Here's everything, in order.` : `Nothing is urgent. Here's what's worth your attention.`, [{ type: "priorities", groups, buttons: [{ label: "Open Tasks", style: "secondary", href: "/tasks" }] }]);
}

export async function debriefHandler(ctx: Ctx): Promise<HandlerOut> {
  const d = await buildDebrief(ctx);
  return reply("Here's your day.", [{ type: "debrief", greeting: greetingFor(ctx.now, ctx.tz, ctx.profile.full_name).toUpperCase(), counts: d.counts, noticed: d.noticed, buttons: [{ label: "Open Home", style: "secondary", href: "/" }] }]);
}

export async function findContactsHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const t = text.toLowerCase();
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
  const all = await ctx.store.list("contacts", ctx.userId);
  const full = all.filter((c) => t.includes(c.name.toLowerCase()));
  if (full.length) return full;
  const words = new Set(t.replace(/['’]s\b/g, "").split(/[^a-z0-9'’-]+/).filter((w) => w.length >= 3)); // "Priya's number" names Priya
  const stop = new Set(["who", "the", "and", "for", "all", "tell", "about", "what", "contact", "contacts", "buyer", "seller", "lead", "client", "test"]);
  const shortNames = new Set([...text.matchAll(/(?<![\p{L}])(\p{Lu}\p{Ll})(?![\p{L}])/gu)].map((m) => m[1].toLowerCase())); // "Li", "Mc": only when written as a name
  return all.filter((c) => { const f = c.name.toLowerCase().split(/\s+/)[0]; return (f.length >= 3 ? words.has(f) : shortNames.has(f)) && !stop.has(f); });
}

export async function recallHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const found = await mentionedContacts(ctx, text);
  const wantsEmail = /\b(e-?mail)\b/i.test(text), wantsPhone = /\b(phone|number|cell|mobile)\b/i.test(text);
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
  const body = text.replace(/^.*?\b(?:remember(?: that)?|note that|keep in mind(?: that)?)\b[:,]?\s*/i, "").trim();
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
  if (!c) return reply("Who is it for?");
  const facts = await contactFacts(ctx, c);
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
