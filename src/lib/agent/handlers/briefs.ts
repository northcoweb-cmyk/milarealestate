import type { BriefItem, BriefSection, Block, CalendarEvent, Contact, EmailDraft, Property } from "../../types";
import { type Ctx, firstName, fullMoney, plural } from "../context";
import { followUpEmail } from "../comms";
import { buildListingBrief, LISTING_DATE_KEY } from "../readiness";
import { computePriorities } from "../prioritize";
import { addrKey, parseAddress, parseDate, parseTime } from "../nlu";
import { DAY_MS, fmtDay, fmtTime, partsIn, relativeDays, startOfDay } from "../../time";
import { TOOLS, invoke } from "../tools";
import { askBack } from "./ask";
import { type HandlerOut, reply } from "./types";

const ask = (text: string) => ({ type: "prompt", text }) as const;
const ago = (iso: string | null, now: Date) => { if (!iso) return null; const d = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const sameDay = (iso: string, y: number, m: number, d: number, tz: string) => { const p = partsIn(new Date(iso), tz); return p.y === y && p.m === m && p.d === d; };

// =============================================================================== "Prep me for my 2 PM meeting with John"
export async function meetingPrepHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const { store, userId, now, tz } = ctx;
  const who = /\bwith\s+([A-Za-z][A-Za-z'’-]+(?:\s+[A-Za-z][A-Za-z'’-]+)?)/i.exec(text)?.[1]?.replace(/\b(at|on|today|tomorrow|tonight|later)\b.*$/i, "").trim();
  if (!who) return askBack(ctx, "meeting_prep", text, "name", "Who is the meeting with?");
  const [contacts, events] = await Promise.all([store.list("contacts", userId), store.list("calendar_events", userId)]);
  const [first, last] = who.toLowerCase().split(/\s+/);
  const cands = contacts.filter((c) => { const n = c.name.toLowerCase().split(/\s+/); return n[0] === first && (!last || n[n.length - 1] === last); });
  if (!cands.length) return reply(`I don't have anyone named ${who} in your contacts yet. Add them and I'll prep you — or tell me about them (“${who} is a buyer looking for a 3 bed around $600k”).`, [], "smalltalk");

  // the meeting: that person's event on the day (today unless said), closest to the time given
  const date = parseDate(text, now, tz) ?? (() => { const p = partsIn(now, tz); return { y: p.y, m: p.m, d: p.d }; })();
  const time = parseTime(text);
  const want = time ? time.start.h * 60 + time.start.mi : null;
  const ids = new Set(cands.map((c) => c.id));
  const dayEvents = events.filter((e) => e.status === "confirmed" && sameDay(e.start_at, date.y, date.m, date.d, tz) && ((e.contact_id && ids.has(e.contact_id)) || cands.some((c) => e.title.toLowerCase().includes(c.name.toLowerCase().split(" ")[0]))));
  const mins = (e: CalendarEvent) => { const p = partsIn(new Date(e.start_at), tz); return p.h * 60 + p.mi; };
  const best = [...dayEvents].sort((a, b) => (want == null ? mins(a) - mins(b) : Math.abs(mins(a) - want) - Math.abs(mins(b) - want)))[0] ?? null;
  // a different time than the one asked for isn't "the" meeting (lunch at 1 is not the 2 PM)
  const ev = best && (want == null || Math.abs(mins(best) - want) <= 45) ? best : null;
  const nearby = best && !ev ? best : null;
  const c: Contact = ((ev ?? nearby)?.contact_id ? cands.find((x) => x.id === (ev ?? nearby)!.contact_id) : null) ?? [...cands].sort((a, b) => (b.last_contact_at ?? b.created_at).localeCompare(a.last_contact_at ?? a.created_at))[0];
  ctx.state.last_contact_ids = [c.id];
  ctx.steps.push(`Pulling ${firstName(c.name)}'s file`);

  const [cevents, cnotes, drafts, mems, tasks, props] = await Promise.all([store.list("contact_events", userId), store.list("contact_notes", userId), store.list("email_drafts", userId), store.list("memories", userId), store.list("tasks", userId), store.list("properties", userId)]);
  const sections: BriefSection[] = [];
  const add = (emoji: string, label: string, items: BriefItem[]) => { if (items.length) sections.push({ emoji, label, items }); };
  const first1 = firstName(c.name);

  // the meeting itself
  add("📅", "The meeting", ev
    ? [{ text: `${ev.title.split(" — ")[0]} · ${relativeDays(ev.start_at, now, tz)} ${fmtTime(ev.start_at, tz)}${ev.location ? ` · ${ev.location}` : ""}`, state: "info" }, ...(ev.notes && ev.notes !== "Transaction milestone" ? [{ text: ev.notes, state: "info" as const }] : [])]
    : [...(nearby ? [{ text: `You do have ${nearby.title.split(" — ")[0]} at ${fmtTime(nearby.start_at, tz)}`, state: "info" as const }] : []), { text: `No ${time ? "meeting at that time" : "meeting"} with ${first1} on your calendar — here's their file anyway`, state: "missing" as const, button: { label: "Add it", style: "secondary", action: ask(`Meeting with ${c.name} ${time ? "at " + new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, time.start.h, time.start.mi))) : "today"}`) } }]);

  // who they are
  const want2 = [c.budget_max ? `${c.budget_min ? fullMoney(c.budget_min) + "–" : "up to "}${fullMoney(c.budget_max)}` : null, c.preferences.beds_min ? `${c.preferences.beds_min}+ bd` : null, c.preferences.baths_min ? `${c.preferences.baths_min}+ ba` : null, ...(c.preferences.features ?? []).slice(0, 3), c.location].filter(Boolean).join(" · ");
  const who2: BriefItem[] = [{ text: `${c.type[0].toUpperCase()}${c.type.slice(1)} · ${c.status.replace("_", " ")}${c.source ? ` · from ${c.source}` : ""}${c.last_contact_at ? ` · last talked ${ago(c.last_contact_at, now)}` : " · no contact logged yet"}`, state: "info" }];
  who2.push(want2 ? { text: `Looking for: ${want2}${c.timeline ? ` · ${c.timeline}` : ""}`, state: "info" } : { text: "No budget or wish list saved yet", state: "missing", button: { label: "Note it", style: "secondary", action: ask(`${c.name} is looking for `) } });
  add("👤", first1, who2);

  // previous conversations
  const mine = (x: { contact_id: string }) => x.contact_id === c.id;
  const history: BriefItem[] = [
    ...cevents.filter(mine).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 4).map((e) => ({ text: `${e.title}${e.detail ? ` — ${e.detail}` : ""} · ${ago(e.occurred_at, now)}`, state: "info" as const })),
    ...cnotes.filter(mine).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 2).map((n) => ({ text: `Note: ${n.body.slice(0, 160)}`, state: "info" as const })),
    ...drafts.filter((d: EmailDraft) => d.contact_id === c.id || d.to_contact_ids.includes(c.id)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 2).map((d) => ({ text: `Email: “${d.subject}” (${d.status === "sent" ? "sent" : "draft"}) · ${ago(d.created_at, now)}`, state: "info" as const })),
  ].slice(0, 6);
  if (c.notes) history.push({ text: `About them: ${c.notes.replace(/\s+/g, " ").slice(0, 200)}`, state: "info" });
  add("💬", "Previous conversations", history);

  // what I remember
  add("🧠", "What I remember", mems.filter((m) => m.scope === "contact" && m.subject_id === c.id && !m.key.startsWith("cache:")).slice(0, 4).map((m) => ({ text: `${m.key}: ${m.value}`, state: "info" as const })));

  // properties: ones they've seen / are tied to, then homes of yours that fit
  const linked = new Set([...events.filter((e) => e.contact_id === c.id && e.property_id).map((e) => e.property_id!), ...tasks.filter((t) => t.contact_id === c.id && t.property_id).map((t) => t.property_id!)]);
  const seen = props.filter((p) => linked.has(p.id));
  const fits = c.budget_max ? props.filter((p) => !linked.has(p.id) && p.list_price && p.list_price <= c.budget_max! * 1.05 && (c.budget_min == null || p.list_price >= c.budget_min * 0.85)).slice(0, 2) : [];
  const propLine = (p: Property) => `${p.address}${p.list_price ? ` · ${fullMoney(p.list_price)}` : ""}${p.beds != null ? ` · ${p.beds} bd` : ""}`;
  add("🏠", "Properties", [...seen.slice(0, 3).map((p) => ({ text: `Connected: ${propLine(p)}`, state: "info" as const })), ...fits.map((p) => ({ text: `Fits their budget: ${propLine(p)}`, state: "info" as const }))]);

  // what's coming + what to do
  const myTasks = tasks.filter((t) => t.contact_id === c.id && t.status === "open").slice(0, 3);
  const later = events.filter((e) => e.status === "confirmed" && e.contact_id === c.id && new Date(e.start_at) > now && e.id !== ev?.id).sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 2);
  const todo: BriefItem[] = [...myTasks.map((t) => ({ text: `${t.title}${t.due_at ? ` · due ${fmtDay(t.due_at, tz)}` : ""}`, state: "info" as const })), ...later.map((e) => ({ text: `${e.title.split(" — ")[0]} · ${fmtDay(e.start_at, tz)} ${fmtTime(e.start_at, tz)}`, state: "info" as const }))];
  if (c.next_action) todo.unshift({ text: `Next step: ${c.next_action}${c.next_action_at ? ` (${fmtDay(c.next_action_at, tz)})` : ""}`, state: "info" });
  add("✅", "Open tasks & what's next", todo);

  const talk: string[] = [];
  if (c.last_contact_at && Math.floor((now.getTime() - new Date(c.last_contact_at).getTime()) / DAY_MS) >= 7) talk.push(`It's been ${ago(c.last_contact_at, now)} — open by reconnecting`);
  if (!c.budget_max) talk.push("Confirm budget and timeline");
  if (c.type === "buyer" || c.type === "lead") talk.push(fits.length ? `Float ${fits[0].address}` : "Ask what they've seen and liked so far");
  if (c.type === "seller") talk.push("Review pricing and the plan to list");
  talk.push("Agree on the next step before you hang up");
  add("🎯", "Suggested talking points", talk.slice(0, 4).map((t) => ({ text: t, state: "info" as const })));

  const block: Block = { type: "listing_brief", kicker: "Meeting prep", title: ev ? ev.title.split(" — ")[0] : `${c.name}`, subtitle: ev ? `${relativeDays(ev.start_at, now, tz)} ${fmtTime(ev.start_at, tz)}` : undefined, done: 0, total: 0, sections, buttons: [{ label: `Open ${first1}`, style: "quiet", href: `/contacts/${c.id}` }, { label: `Draft a follow-up`, style: "secondary", action: ask(`Draft a follow-up email to ${c.name}`) }] };
  return reply(`Here's your prep for ${ev ? `${first1} at ${fmtTime(ev.start_at, tz)}` : first1}: ${[history.length ? `${plural(history.length, "past touchpoint")}` : "no history yet", seen.length ? plural(seen.length, "property", "properties") : null, myTasks.length ? plural(myTasks.length, "open task") : null].filter(Boolean).join(", ")}.`, [block], "chat_simple");
}

// =============================================================================== "Follow up with everyone I showed 1231 Main Street to last week"
export async function showingFollowupsHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const { store, userId, now } = ctx;
  const props = await store.list("properties", userId);
  const addr = parseAddress(text);
  const prop = (addr ? props.find((p) => addrKey(p.address) === addrKey(addr)) : null) ?? (ctx.state.last_property_id ? props.find((p) => p.id === ctx.state.last_property_id) : null) ?? null;
  if (!prop) return askBack(ctx, "showing_followups", text, "address", "Which property? Give me the street address.");
  ctx.state.last_property_id = prop.id;
  const t = text.toLowerCase();
  const days = /\blast week\b/.test(t) ? 14 : /\byesterday\b/.test(t) ? 2 : /\bthis week\b/.test(t) ? 7 : /\btoday\b/.test(t) ? 1 : 30;
  const since = now.getTime() - days * DAY_MS;
  const [events, contacts] = await Promise.all([store.list("calendar_events", userId), store.list("contacts", userId)]);
  const visits = events.filter((e) => e.status === "confirmed" && e.property_id === prop.id && (e.kind === "showing" || e.kind === "open_house") && new Date(e.start_at).getTime() >= since && new Date(e.start_at).getTime() <= now.getTime());
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const people = new Map<string, Contact>();
  for (const e of visits) if (e.contact_id && byId.has(e.contact_id)) people.set(e.contact_id, byId.get(e.contact_id)!);
  if (visits.some((e) => e.kind === "open_house")) for (const c of contacts) if (c.tags.includes(`open-house:${prop.address}`)) people.set(c.id, c);
  const list = [...people.values()];
  if (!list.length) return reply(`I don't have anyone logged as seeing ${prop.address} in that time${visits.length ? ` (there ${visits.length === 1 ? "was a showing" : "were showings"}, but no one is attached)` : ""}. Tell me who — “I showed ${prop.address} to Dana and Marcus” — or upload the sign-in sheet, and I'll write to everyone.`, [], "smalltalk");

  ctx.steps.push("Writing personalized follow-ups");
  const mems = await store.list("memories", userId);
  const withEmail = list.filter((c) => c.email), noEmail = list.filter((c) => !c.email);
  const drafts: { c: Contact; d: EmailDraft; cls: string }[] = [];
  for (const c of withEmail) {
    const note = mems.filter((m) => m.scope === "contact" && m.subject_id === c.id).map((m) => `${m.key}: ${m.value}`).join("; ");
    const visit = visits.some((e) => e.contact_id === c.id && e.kind === "showing") ? "showing" : "open_house";
    const mail = followUpEmail(ctx, c, prop, [note, c.notes].filter(Boolean).join("; ") || null, visit);
    const r = (await TOOLS.draft_email.run(ctx, { contact_id: c.id, subject: mail.subject, body: mail.body, property_id: prop.id, event_id: null })) as any;
    drafts.push({ c, d: r.data.draft as EmailDraft, cls: mail.cls });
  }
  const blocks: Block[] = drafts.slice(0, 3).map(({ c, d, cls }) => ({ type: "draft_email" as const, draftId: d.id, to: `${c.name} <${c.email}>`, subject: d.subject, body: d.body.replaceAll("{{first_name}}", firstName(c.name)), status: cls === "general" ? "Draft" : `Draft · ${cls}` }));
  if (drafts.length) {
    const out = await invoke(ctx, "send_email_batch", { draftIds: drafts.map((x) => x.d.id), title: `Follow-ups — ${prop.address}` });
    for (const x of drafts) await store.update("email_drafts", userId, x.d.id, { status: out.status === "needs_approval" ? "pending_approval" : "draft" });
    if (out.status === "needs_approval") blocks.push({ type: "notice", tone: "info", title: `${plural(drafts.length, "follow-up")} ready`, body: `Each one is personalized from what you know about them. You review, then send from your own email app.${noEmail.length ? ` ${plural(noEmail.length, "person has", "people have")} no email: ${noEmail.map((c) => firstName(c.name)).join(", ")}.` : ""}`, buttons: [{ label: "Open in email app", style: "primary", href: `/tasks?approval=${out.approval.id}` }] });
  }
  const names = list.slice(0, 4).map((c) => firstName(c.name)).join(", ") + (list.length > 4 ? ` and ${list.length - 4} more` : "");
  return reply(`${plural(list.length, "person")} saw ${prop.address} ${/last week/.test(t) ? "last week" : "recently"}: ${names}. I wrote ${plural(drafts.length, "personalized follow-up")} for your approval.`, blocks, "email_generation");
}

// =============================================================================== "What am I forgetting today?"
export async function forgettingTodayHandler(ctx: Ctx): Promise<HandlerOut> {
  const { store, userId, now, tz } = ctx;
  ctx.steps.push("Looking across your day");
  const [events, tasks, props, mems, approvals, reminders, posts] = await Promise.all([store.list("calendar_events", userId), store.list("tasks", userId), store.list("properties", userId), store.list("memories", userId), store.list("approvals", userId), store.list("reminders", userId), store.list("social_posts", userId)]);
  const dayStart = startOfDay(now, tz), dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const sections: BriefSection[] = [];
  const add = (emoji: string, label: string, items: BriefItem[]) => { if (items.length) sections.push({ emoji, label, items }); };
  const cById = new Map((await store.list("contacts", userId)).map((c) => [c.id, c]));

  const today = events.filter((e) => e.status === "confirmed" && new Date(e.end_at).getTime() > now.getTime() && new Date(e.start_at).getTime() < dayEnd.getTime()).sort((a, b) => a.start_at.localeCompare(b.start_at));
  add("📅", "Today", today.slice(0, 4).map((e) => {
    const c = e.contact_id ? cById.get(e.contact_id) : null;
    return { text: `${fmtTime(e.start_at, tz)} · ${e.title.split(" — ")[0]}`, state: "missing" as const, button: c && ["meeting", "call", "lunch", "other"].includes(e.kind) ? { label: "Prep me", style: "secondary" as const, action: ask(`Prep me for my ${fmtTime(e.start_at, tz)} ${e.kind === "call" ? "call" : "meeting"} with ${firstName(c.name)}`) } : e.property_id ? { label: "Open", style: "quiet" as const, href: `/properties/${e.property_id}` } : undefined };
  }));

  const due = tasks.filter((t) => t.status === "open" && t.due_at && new Date(t.due_at).getTime() < dayEnd.getTime() && t.kind !== "approval").sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? "")).slice(0, 4);
  add("✅", "Due or overdue", due.map((t) => ({ text: `${t.title}${new Date(t.due_at!).getTime() < dayStart.getTime() ? " · overdue" : ""}`, state: "missing" as const, button: { label: "Open", style: "quiet" as const, href: "/tasks" } })));

  const quiet = (await computePriorities(ctx)).filter((p) => p.source === "contact" && p.contactId).slice(0, 3);
  add("💬", "People waiting on you", quiet.map((p) => ({ text: `${p.title} — ${p.reason}`, state: "missing" as const, button: { label: "Draft message", style: "secondary" as const, action: ask(`Draft a follow-up email to ${p.title}`) } })));

  // listings that are about to go live / hold an open house and still have gaps
  const soon = props.map((p) => {
    const dated = mems.find((m) => m.scope === "property" && m.subject_id === p.id && m.key === LISTING_DATE_KEY)?.value ?? null;
    const oh = events.find((e) => e.status === "confirmed" && e.property_id === p.id && e.kind === "open_house" && new Date(e.start_at).getTime() > now.getTime() && new Date(e.start_at).getTime() < now.getTime() + 4 * DAY_MS);
    const live = dated && dated >= now.toISOString().slice(0, 10) && new Date(`${dated}T12:00:00Z`).getTime() < now.getTime() + 8 * DAY_MS;
    return live || oh ? p : null;
  }).filter(Boolean) as Property[];
  const listItems: BriefItem[] = [];
  for (const p of soon.slice(0, 3)) {
    const brief = await buildListingBrief(ctx, p);
    for (const m of brief.missing.slice(0, 2)) listItems.push({ text: `${p.address}: ${m.text}`, state: "missing", button: m.button });
  }
  add("🏠", "Listings coming up", listItems.slice(0, 5));

  const waiting = approvals.filter((a) => a.status === "pending").length + posts.filter((p) => p.status === "draft" || p.status === "pending_approval").length;
  const rem = reminders.filter((r) => r.status === "pending" && new Date(r.remind_at).getTime() < dayEnd.getTime()).slice(0, 2);
  add("🔔", "Waiting on you", [...(waiting ? [{ text: `${plural(waiting, "draft")} ready for your approval`, state: "missing" as const, button: { label: "Review", style: "secondary" as const, href: "/" } }] : []), ...rem.map((r) => ({ text: `Reminder: ${r.title} · ${fmtTime(r.remind_at, tz)}`, state: "info" as const }))]);

  const n = sections.flatMap((s) => s.items).filter((i) => i.state === "missing").length;
  if (!sections.length) return reply("Nothing's slipping today. Your calendar, follow-ups and listings are all covered.", [], "chat_simple");
  const lead = [today.length && `${plural(today.length, "thing")} on your calendar`, due.length && `${plural(due.length, "task")} due`, quiet.length && `${plural(quiet.length, "person", "people")} waiting to hear from you`, listItems.length && `${plural(listItems.length, "listing gap")}`].filter(Boolean).join(", ");
  return reply(`Here's what I'd hate for you to forget today: ${lead || `${plural(n, "thing")}`}.`, [{ type: "listing_brief", kicker: "Today", title: "What you might be forgetting", subtitle: `${new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(now)}`, done: 0, total: 0, sections }], "chat_simple");
}
