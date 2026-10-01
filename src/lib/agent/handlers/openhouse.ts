import { addDays, fmtDay, fmtDayTime, fmtRange, fmtShortDate, partsIn, zonedToUtc } from "../../time";
import type { Block, CalendarEvent, Contact, EmailDraft, Property, SocialPost, WorkflowRun } from "../../types";
import type { Ctx } from "../context";
import { plural } from "../context";
import { persistState } from "../conversation";
import { openHouseEmail, openHouseSocial, polish } from "../comms";
import { parseAddress, parseWhen } from "../nlu";
import { TOOLS, eventConflicts, invoke } from "../tools";
import { type HandlerOut, reply } from "./types";
import { autoPhotos, explainPull, firstUrl } from "./photos";

type Item = WorkflowRun["plan"][number];

export async function openHouseAudience(ctx: Ctx): Promise<Contact[]> {
  const all = await ctx.store.list("contacts", ctx.userId);
  return all.filter((c) => ["buyer", "lead", "past_client"].includes(c.type) && c.email && c.status !== "inactive");
}

export async function openHouseHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const address = parseAddress(text);
  if (!address) {
    const last = ctx.state.last_property_id ? await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id) : null;
    if (!last) {
      ctx.state.pending = { kind: "clarify", intent: "open_house", slots: { text }, missing: "address" };
      await persistState(ctx);
      return reply("Which property is the open house at?");
    }
    return openHouseHandler(ctx, `${text} at ${last.address}`);
  }
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
  const start = w.start!;
  const end = w.end ?? new Date(start.getTime() + 2 * 3_600_000); // default 2h; stated in the summary so it's easy to correct
  if (start.getTime() < ctx.now.getTime()) return reply(`That time has already passed. Did you mean next ${fmtDay(start, ctx.tz)}?`);

  ctx.steps.push("Checking your calendar");
  const conflicts = await eventConflicts(ctx, start.toISOString(), end.toISOString());
  const draft = { __openHouse: true, text, address, start_at: start.toISOString(), end_at: end.toISOString(), assumedEnd: !w.end };
  if (conflicts.length) {
    const c = conflicts[0];
    ctx.state.pending = { kind: "calendar_conflict", draft, conflict_ids: conflicts.map((x) => x.id) };
    await persistState(ctx);
    const nm = c.title.split(/[,—-]/)[0].trim();
    return reply(`Before I set this up: you already have ${c.title} then.`, [{
      type: "choice", title: `You already have ${c.title} scheduled ${fmtDayTime(c.start_at, ctx.tz)}.`, body: "Would you like me to:",
      buttons: [
        { label: `Keep ${nm}`, style: "secondary", action: { type: "conflict", choice: "keep" } },
        { label: `Move ${nm}`, style: "secondary", action: { type: "conflict", choice: "move" } },
        { label: "Find another time", style: "primary", action: { type: "conflict", choice: "find" } },
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
  const prop = ((await TOOLS.create_property.run(ctx, { address })) as any).data.property as Property;
  ctx.state.last_property_id = prop.id;

  const run = await ctx.store.insert("workflow_runs", ctx.userId, {
    workflow_key: "open_house", title: address, subtitle: `${fmtDay(start, ctx.tz)} • ${fmtRange(start, end, ctx.tz)}`,
    status: "running", params: { address, start_at: start.toISOString(), end_at: end.toISOString() }, plan: [], outputs: {},
  });
  const outputs: Record<string, unknown> = { property_id: prop.id };

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
    plan.push({ label: "Calendar event", tool: "create_calendar_event", state: "done", detail: (calOut.result.data as any).syncedToGoogle ? "Added to Google Calendar" : "Added to your Mila calendar" });
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

  // 5. email draft + send approval
  ctx.steps.push("Preparing messages");
  const mail = openHouseEmail(ctx, prop, start, end);
  const body = await polish(ctx, "email", mail.body);
  const dr = (await TOOLS.draft_email.run(ctx, { subject: mail.subject, body, to_contact_ids: audience.map((c) => c.id), property_id: prop.id, event_id: eventId, workflow_run_id: run.id })) as any;
  const emailDraft = dr.data.draft as EmailDraft;
  outputs.email_draft_id = emailDraft.id;
  if (audience.length) {
    const s = await invoke(ctx, "send_email", { draftId: emailDraft.id }, { runId: run.id });
    if (s.status === "needs_approval") {
      await ctx.store.update("email_drafts", ctx.userId, emailDraft.id, { status: "pending_approval" });
      plan.push({ label: "Open-house email", tool: "send_email", state: "needs_approval", detail: `${plural(audience.length, "recipient")} • ready to review` }); pendingApprovals++;
    } else plan.push({ label: "Open-house email", tool: "send_email", state: s.result.ok ? "done" : "failed", detail: s.result.ok ? "Sent" : s.result.message });
  } else plan.push({ label: "Open-house email", tool: "draft_email", state: "pending", detail: "Drafted — add contacts to send" });

  // 6a. photos: pull from a listing link if we have one (never required; uploading is the last resort)
  const link = firstUrl(String(draft.text ?? "")) ?? prop.listing_url;
  const pulled = await autoPhotos(ctx, prop, link);

  // 6. social post
  ctx.steps.push("Designing the post");
  const images = (await ctx.store.list("property_images", ctx.userId)).filter((i) => i.property_id === prop.id).sort((a, b) => a.position - b.position).map((i) => i.id);
  const soc = openHouseSocial(ctx, prop, start, end, images);
  const sp = (await TOOLS.create_social_post.run(ctx, { platform: "instagram", caption: soc.caption, hashtags: soc.hashtags, slides: soc.slides, property_id: prop.id, event_id: eventId, workflow_run_id: run.id })) as any;
  const post = sp.data.post as SocialPost;
  outputs.social_post_id = post.id;
  const pub = await invoke(ctx, "publish_social_post", { postId: post.id }, { runId: run.id });
  if (pub.status === "needs_approval") {
    await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
    plan.push({ label: "Instagram carousel", tool: "publish_social_post", state: "needs_approval", detail: images.length ? `${plural(images.length, "photo")}${pulled?.added ? ` from ${pulled.host}` : ""}` : pulled ? explainPull(pulled, prop.address) : "No photos yet — send a listing link and I'll pull them" }); pendingApprovals++;
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
  if (!images.length) missing.push("a listing link for photos");
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
      ...(pendingApprovals ? [{ label: "Do it", style: "primary" as const, action: { type: "approve_run", runId: run.id } }] : []),
    ],
  });
  return reply("Got it. I've prepared your open house.", blocks, "workflow_open_house");
}

export { fmtShortDate };
