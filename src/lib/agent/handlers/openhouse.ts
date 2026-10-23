import { renderMerge } from "../../merge";
import { pickProperty } from "./entity";
import { addDays, fmtDay, fmtDayTime, fmtRange, fmtShortDate, partsIn, zonedToUtc } from "../../time";
import type { Block, CalendarEvent, Contact, EmailDraft, Property, SocialPost, WorkflowRun } from "../../types";
import type { Ctx } from "../context";
import { plural } from "../context";
import { persistState } from "../conversation";
import { openHouseEmail, openHouseSocial, polish } from "../comms";
import { addrKey, parseAddress, parseWhen, rollPastWeekday } from "../nlu";
import { TOOLS, eventConflicts, invoke } from "../tools";
import { type HandlerOut, reply } from "./types";
import { locationGate } from "./location";
import { extractListingFacts } from "../listing";
import { describeFacts, enrichProperty } from "../property-lookup";

type Item = WorkflowRun["plan"][number];

export async function openHouseAudience(ctx: Ctx): Promise<Contact[]> {
  const all = await ctx.store.list("contacts", ctx.userId);
  return all.filter((c) => ["buyer", "lead", "past_client"].includes(c.type) && c.email && c.status !== "inactive");
}

/** Drafts the open-house / listing email to the audience and queues it for approval. Never sends on its own. */
export async function prepareAudienceEmail(ctx: Ctx, prop: Property, start: Date, end: Date, eventId: string | null, runId: string | null, audience: Contact[]): Promise<{ item: Item; pending: number; draftId: string }> {
  const mail = openHouseEmail(ctx, prop, start, end);
  const body = await polish(ctx, "email", mail.body);
  const dr = (await TOOLS.draft_email.run(ctx, { subject: mail.subject, body, to_contact_ids: audience.map((c) => c.id), property_id: prop.id, event_id: eventId, workflow_run_id: runId })) as any;
  const emailDraft = dr.data.draft as EmailDraft;
  if (!audience.length) return { item: { label: "Open-house email", tool: "draft_email", state: "pending", detail: "Drafted — add contacts with emails to send" }, pending: 0, draftId: emailDraft.id };
  const s = await invoke(ctx, "send_email", { draftId: emailDraft.id }, runId ? { runId } : undefined);
  if (s.status === "needs_approval") {
    await ctx.store.update("email_drafts", ctx.userId, emailDraft.id, { status: "pending_approval" });
    return { item: { label: "Open-house email", tool: "send_email", state: "needs_approval", detail: `${plural(audience.length, "recipient")} • ready to review` }, pending: 1, draftId: emailDraft.id };
  }
  return { item: { label: "Open-house email", tool: "send_email", state: s.result.ok ? "done" : "failed", detail: s.result.ok ? "Sent" : s.result.message }, pending: 0, draftId: emailDraft.id };
}

/** "Email my contacts about the open house at 123 Main" — the optional, on-demand version. */
export async function emailAudienceHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const addr = parseAddress(text);
  const events = (await ctx.store.list("calendar_events", ctx.userId)).filter((e) => e.status === "confirmed" && e.kind === "open_house" && new Date(e.end_at).getTime() > ctx.now.getTime()).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const ev = events.find((e) => !addr || `${e.title} ${e.location ?? ""}`.toLowerCase().includes(addr.toLowerCase())) ?? null;
  let prop: Property | null = ev?.property_id ? await ctx.store.get("properties", ctx.userId, ev.property_id) : null;
  if (!prop && addr) prop = (await ctx.store.list("properties", ctx.userId)).find((p) => addrKey(p.address) === addrKey(addr)) ?? null;
  if (!prop && ctx.state.last_property_id) prop = await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id);
  if (!prop) return reply("Which listing or open house is the email for? Give me the address.");
  const audience = await openHouseAudience(ctx);
  if (!audience.length) return reply("None of your contacts have an email address yet, so there's nobody to send to. Add some emails and ask me again.", [{ type: "notice", tone: "info", title: "No contacts with email", buttons: [{ label: "Open Contacts", style: "secondary", href: "/contacts" }] }]);
  ctx.steps.push("Preparing the email");
  const start = ev ? new Date(ev.start_at) : ctx.now, end = ev ? new Date(ev.end_at) : ctx.now;
  const em = await prepareAudienceEmail(ctx, prop, start, end, ev?.id ?? null, null, audience);
  const draftRow = await ctx.store.get("email_drafts", ctx.userId, em.draftId);
  return reply(`I drafted an email to ${plural(audience.length, "contact")} about ${prop.address}. You send it from your own email app.`, [{ type: "draft_email", draftId: em.draftId, to: `${plural(audience.length, "contact")}`, subject: draftRow?.subject ?? "", body: renderMerge(draftRow?.body ?? "", audience), status: "Draft", buttons: [{ label: "Open in email app", style: "primary", href: "/tasks" }] }], "email_generation");
}

export async function openHouseHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const address = parseAddress(text);
  if (!address) {
    // no address given: the home this conversation is on, or the only saved home. With several homes Mila asks which one: never a guess.
    // a new open house with no address in the message is NEVER assumed to be the home last discussed (an old sample or a past listing):
    // Mila offers the recent homes as buttons and takes a typed address too
    const all = await ctx.store.list("properties", ctx.userId);
    const props = all.some((p) => !p.is_demo) ? all.filter((p) => !p.is_demo || ctx.state.last_property_id === p.id) : all; // a demo-only account offers its demo homes
    const recent = [...props].sort((a, b) => (a.id === ctx.state.last_property_id ? 1 : 0) - (b.id === ctx.state.last_property_id ? 1 : 0) || b.updated_at.localeCompare(a.updated_at)).slice(0, 3);
    ctx.state.pending = { kind: "clarify", intent: "open_house", slots: { text }, missing: "address" };
    await persistState(ctx);
    return reply("Which property is the open house for? Type the street address, or pick one you've saved.", recent.length ? [{ type: "choice", title: "Saved homes", buttons: recent.map((p) => ({ label: `${p.address}${p.city ? `, ${p.city}` : ""}`, style: "secondary" as const, action: { type: "prompt", text: `${text.replace(/[.!?\s]+$/, "")} at ${p.address}` } })) }] : [], "smalltalk");
  }
  const gate = await locationGate(ctx, "open_house", text, address);
  if (!gate.ok) return gate.out;
  const w = parseWhen(text, ctx.now, ctx.tz);
  if (!w.date) {
    ctx.state.pending = { kind: "clarify", intent: "open_house", slots: { text }, missing: "date" };
    await persistState(ctx);
    return reply(`Which day is the open house at ${address}?`);
  }
  if (!w.time) {
    ctx.state.pending = { kind: "clarify", intent: "open_house", slots: { text }, missing: "time" };
    await persistState(ctx);
    return reply(`What time does it start on ${fmtDay(w.start!, ctx.tz)}?`);
  }
  const start = rollPastWeekday(w.start!, text, ctx.now, ctx.tz);
  const end = w.end && start.getTime() === w.start!.getTime() ? w.end : new Date(start.getTime() + (w.end && w.start ? w.end.getTime() - w.start.getTime() : 2 * 3_600_000)); // default 2h; stated in the summary so it's easy to correct
  // one that is happening right now ("open house today from 1-3" said at 2pm) is still real: put it on the calendar
  if (end.getTime() <= ctx.now.getTime()) return reply(/\btoday\b/i.test(text) ? `That open house window (${fmtRange(start, end, ctx.tz)}) has already ended today. Which day did you mean?` : `That time has already passed. Did you mean next ${fmtDay(start, ctx.tz)}?`);

  ctx.steps.push("Checking your calendar");
  const conflicts = await eventConflicts(ctx, start.toISOString(), end.toISOString());
  const draft = { __openHouse: true, text, address, place: gate.found.place, unverified: !!gate.found.unverified, assumed: !!gate.found.assumed, start_at: start.toISOString(), end_at: end.toISOString(), assumedEnd: !w.end };
  if (conflicts.length) {
    const c = conflicts[0];
    ctx.state.pending = { kind: "calendar_conflict", draft, conflict_ids: conflicts.map((x) => x.id) };
    await persistState(ctx);
    const nm = c.title.split(/[,—-]/)[0].trim();
    return reply(`Before I set this up: you already have ${c.title}, ${fmtDayTime(c.start_at, ctx.tz)}, which overlaps it.`, [{
      type: "choice", title: "What should I do about the overlap?", body: "Would you like me to:",
      buttons: [
        { label: `Keep ${nm}`, style: "secondary", action: { type: "conflict", choice: "keep" } },
        { label: `Move ${nm}`, style: "secondary", action: { type: "conflict", choice: "move" } },
        { label: "Keep both", style: "primary", action: { type: "conflict", choice: "both" } },
        { label: "Find another time", style: "secondary", action: { type: "conflict", choice: "find" } },
      ],
    }]);
  }
  return continueOpenHouse(ctx, draft, start, end);
}

export async function continueOpenHouse(ctx: Ctx, draft: Record<string, any>, start: Date, end: Date): Promise<HandlerOut> {
  const address = draft.address as string;
  const plan: Item[] = [];
  const blocks: Block[] = [];
  let pendingApprovals = 0;

  // 1. property
  const place = (draft.place ?? {}) as { city?: string; state?: string; zip?: string; county?: string };
  const stated = extractListingFacts(String(draft.text ?? ""));
  let prop = ((await TOOLS.create_property.run(ctx, { address, city: place.city, state: place.state, zip: place.zip, county: place.county, list_price: stated.list_price, beds: stated.beds, baths: stated.baths, sqft: stated.sqft })) as any).data.property as Property;
  ctx.state.last_property_id = prop.id;
  // 1b. look the address up online and prefill beds / baths / size / price (saved as unconfirmed)
  ctx.steps.push("Looking up the property online");
  const unverified = draft.unverified === true;
  const enr = unverified ? { property: prop, memory: null } : await enrichProperty(ctx, prop, { place }); // no point spending a lookup on an address that doesn't exist on the map
  prop = enr.property;
  const lookupItem: Item = unverified
    ? { label: "Property details", tool: "lookup_property", state: "skipped", detail: "I couldn't find this address on the map — double-check the spelling, then open the property page to look it up" }
    : enr.memory?.found
    ? { label: "Property details", tool: "lookup_property", state: "done", detail: `${describeFacts(enr.memory.facts) || "Found"} — found automatically` }
    : { label: "Property details", tool: "lookup_property", state: "skipped", detail: enr.memory?.note === "no_ai" ? "Add beds, baths and size on the property page" : "Couldn't find this exact home online — add the details on the property page" };

  const run = await ctx.store.insert("workflow_runs", ctx.userId, {
    workflow_key: "open_house", title: address, subtitle: `${fmtDay(start, ctx.tz)} • ${fmtRange(start, end, ctx.tz)}`,
    status: "running", params: { address, start_at: start.toISOString(), end_at: end.toISOString() }, plan: [], outputs: {},
  });
  const outputs: Record<string, unknown> = { property_id: prop.id };

  plan.push(lookupItem);

  // 2. calendar
  const calOut = await invoke(ctx, "create_calendar_event", {
    title: `Open House — ${address}`, kind: "open_house", start_at: start.toISOString(), end_at: end.toISOString(),
    location: prop.city ? `${address}, ${prop.city}` : address, property_id: prop.id,
  }, { runId: run.id });
  let event: CalendarEvent | null = null;
  if (calOut.status === "needs_approval") { plan.push({ label: "Calendar event", tool: "create_calendar_event", state: "needs_approval", detail: "Waiting for your OK" }); pendingApprovals++; }
  else if (calOut.result.ok) {
    event = (calOut.result.data as { event: CalendarEvent }).event;
    outputs.event_id = event.id; ctx.state.last_event_id = event.id;
    plan.push({ label: "Calendar event", tool: "create_calendar_event", state: "done", detail: (calOut.result.data as any).syncedToGoogle ? "Added to Google Calendar" : (calOut.result.data as any).syncPending ? "Saved in Mila; Google Calendar did not confirm it yet" : "Added to your Mila calendar" });
  } else plan.push({ label: "Calendar event", tool: "create_calendar_event", state: "failed", detail: calOut.result.message });

  // Communications reference the event; if the calendar write is waiting for approval, fall back to the
  // proposed times (stale detection links through event_id once it exists).
  const eventId = event?.id ?? null;

  // 3. reminder (day before at 9am, else 2h before)
  let remindAt = (() => {
    const p = partsIn(addDays(start, -1, ctx.tz), ctx.tz);
    return zonedToUtc(p.y, p.m, p.d, 9, 0, ctx.tz);
  })();
  if (remindAt.getTime() < ctx.now.getTime() + 10 * 60_000) remindAt = new Date(start.getTime() - 2 * 3_600_000);
  if (remindAt.getTime() > ctx.now.getTime()) {
    const r = await invoke(ctx, "create_reminder", { title: `Open house prep — ${address}`, remind_at: remindAt.toISOString(), event_id: eventId }, { runId: run.id });
    plan.push(r.status === "needs_approval"
      ? (pendingApprovals++, { label: "Reminder", tool: "create_reminder", state: "needs_approval" as const })
      : { label: "Reminder", tool: "create_reminder", state: r.result.ok ? "done" as const : "failed" as const, detail: r.result.ok ? fmtDayTime(remindAt, ctx.tz) : r.result.message });
  } else plan.push({ label: "Reminder", tool: "create_reminder", state: "skipped", detail: "Too close to start" });

  // 4. audience
  ctx.steps.push("Finding relevant contacts");
  const audience = await openHouseAudience(ctx);
  plan.push({ label: "Relevant contact list", tool: "search_contacts", state: audience.length ? "done" : "pending", detail: audience.length ? plural(audience.length, "contact") : "No contacts with email yet" });

  // 5. email to contacts — OPTIONAL. Only prepared if the agent turned it on in Settings or asked for it.
  const wantsEmail = ctx.profile.settings.workflows?.email_contacts === true;
  if (wantsEmail) {
    ctx.steps.push("Preparing messages");
    const em = await prepareAudienceEmail(ctx, prop, start, end, eventId, run.id, audience);
    plan.push(em.item); pendingApprovals += em.pending; outputs.email_draft_id = em.draftId;
  } else plan.push({ label: "Email contacts", tool: "draft_email", state: "skipped", detail: "Optional — tap “Email my contacts” if you want one" });

  // 6. social post
  ctx.steps.push("Designing the post");
  const images = (await ctx.store.list("property_images", ctx.userId)).filter((i) => i.property_id === prop.id).sort((a, b) => a.position - b.position).map((i) => i.id);
  const soc = await openHouseSocial(ctx, prop, start, end, images);
  const sp = (await TOOLS.create_social_post.run(ctx, { platform: "instagram", caption: soc.caption, hashtags: soc.hashtags, slides: soc.slides, property_id: prop.id, event_id: eventId, workflow_run_id: run.id })) as any;
  const post = sp.data.post as SocialPost;
  outputs.social_post_id = post.id;
  const pub = await invoke(ctx, "publish_social_post", { postId: post.id }, { runId: run.id });
  if (pub.status === "needs_approval") {
    await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
    plan.push({ label: "Instagram carousel", tool: "publish_social_post", state: "needs_approval", detail: images.length ? plural(images.length, "photo") : "No photos yet. Add some on the property page (Zillow or Redfin are good places to find them)." }); pendingApprovals++;
  } else plan.push({ label: "Instagram carousel", tool: "publish_social_post", state: pub.result.ok ? "done" : "pending", detail: pub.result.ok ? "Published" : pub.result.message });

  // 7. tasks
  ctx.steps.push("Creating tasks");
  const dayBefore = remindAt.toISOString();
  const dayAfter = (() => { const p = partsIn(addDays(end, 1, ctx.tz), ctx.tz); return zonedToUtc(p.y, p.m, p.d, 10, 0, ctx.tz).toISOString(); })();
  const t1 = await invoke(ctx, "create_task", { kind: "task", title: `Open-house checklist — ${address}`, subtitle: "Signs, sign-in sheet, flyers, refreshments, lockbox, lights", due_at: dayBefore, property_id: prop.id, workflow_run_id: run.id }, { runId: run.id });
  const t2 = await invoke(ctx, "create_task", { kind: "follow_up", title: `Follow up with open-house visitors — ${address}`, subtitle: "Upload the sign-in sheet and I'll draft personalized follow-ups", due_at: dayAfter, property_id: prop.id, workflow_run_id: run.id }, { runId: run.id });
  plan.push({ label: "Open-house checklist", tool: "create_task", state: t1.status === "done" && t1.result.ok ? "done" : "needs_approval" });
  plan.push({ label: "Follow-up workflow", tool: "create_task", state: t2.status === "done" && t2.result.ok ? "done" : "needs_approval" });
  if (t1.status === "needs_approval") pendingApprovals++;
  if (t2.status === "needs_approval") pendingApprovals++;

  await ctx.store.update("workflow_runs", ctx.userId, run.id, { plan, outputs, status: pendingApprovals ? "waiting_approval" : "completed" });
  ctx.state.last_workflow_run_id = run.id;
  await persistState(ctx);

  const missing: string[] = [];
  if (!images.length) missing.push("photos of the home");
  if (!prop.verified) missing.push("verified listing details");
  const items = plan.map((p) => ({ label: p.label, state: p.state, detail: p.detail }));
  blocks.push({
    type: "workflow", runId: run.id, kicker: "OPEN HOUSE", title: address, subtitle: `${fmtDay(start, ctx.tz)} • ${fmtRange(start, end, ctx.tz)}`, items,
    footer: [
      pendingApprovals ? `${plural(pendingApprovals, "item is", "items are")} waiting for your approval.` : "Everything is set.",
      draft.assumedEnd ? "I assumed a 2-hour open house — tell me if it should end at a different time." : "",
      missing.length ? `To make the post better, add ${missing.join(" and ")}.` : "",
    ].filter(Boolean).join(" "),
    buttons: [
      { label: "Review tasks", style: "secondary", href: "/tasks" },
      ...(wantsEmail ? [] : [{ label: "Email my contacts", style: "secondary" as const, action: { type: "prompt", text: `Email my contacts about the open house at ${address}` } }]),
      ...(pendingApprovals ? [{ label: "Do it", style: "primary" as const, action: { type: "approve_run", runId: run.id } }] : []),
    ],
  });
  const assumedNote = draft.assumed ? ` I assumed ${address} is in ${[prop.city, prop.state].filter(Boolean).join(", ")} (your market) — tell me if it's somewhere else.` : "";
  return reply(`Got it. I've prepared your open house.${assumedNote}`, blocks, "workflow_open_house");
}

export { fmtShortDate };

/**
 * "My open house went good today, anything I need to know for this week?" The agent is reporting, not booking.
 * Find the open house that just happened from the calendar (never ask for an address Mila already has), acknowledge it, and show what is next.
 */
export async function openHouseRecapHandler(ctx: Ctx, text: string, weekOverview: (ctx: Ctx) => Promise<HandlerOut>): Promise<HandlerOut> {
  const now = ctx.now.getTime();
  const events = await ctx.store.list("calendar_events", ctx.userId);
  const dayStart = (d: Date) => { const p = partsIn(d, ctx.tz); return `${p.y}-${p.m}-${p.d}`; };
  const wantYesterday = /\byesterday|last night\b/i.test(text);
  const target = new Date(now - (wantYesterday ? 86_400_000 : 0));
  const sameDay = events.filter((e) => e.status === "confirmed" && e.kind === "open_house" && dayStart(new Date(e.start_at)) === dayStart(target)).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const ev = sameDay[sameDay.length - 1] ?? events.filter((e) => e.status === "confirmed" && e.kind === "open_house" && new Date(e.start_at).getTime() <= now).sort((a, b) => b.start_at.localeCompare(a.start_at))[0] ?? null;
  const where = ev ? (ev.location || ev.title.replace(/^open house( at)?\s*/i, "")) : "";
  if (ev) { ctx.state.last_event_id = ev.id; if (ev.property_id) ctx.state.last_property_id = ev.property_id; await persistState(ctx); }
  const asked = /\bhow did|who (?:came|showed|attended)\b/i.test(text);
  const intro = asked ? `I can't see who walked in unless you tell me. Paste your sign-in sheet or give me the names and I'll add them as contacts and draft follow-ups.${ev ? "" : " I also don't see an open house on your calendar for that day."}` : ev ? `Glad it went well${where ? ` at ${where}` : ""}. Nice work.` : "Glad it went well. I don't see an open house on your calendar for that day, so tell me the address if you want me to log it.";
  const week = await weekOverview(ctx);
  const follow: Array<{ label: string; text: string }> = ev ? [{ label: "Email the people who came", text: `email my contacts about the open house${where ? ` at ${where}` : ""}` }, { label: "Make a thank-you post", text: `make a post for the open house${where ? ` at ${where}` : ""}` }] : [];
  const blocks = [...(week.blocks ?? [])];
  if (follow.length) blocks.push({ type: "choice", title: "Want me to follow up?", buttons: follow.map((f) => ({ label: f.label, style: "secondary" as const, action: { type: "prompt" as const, text: f.text } })) } as never);
  return { ...week, text: `${intro} Here's what's coming this week. ${week.text}`.replace(/\s+/g, " ").trim(), blocks };
}
