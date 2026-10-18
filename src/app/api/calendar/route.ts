import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { getGoogle } from "@/lib/integrations/google";
import { bad, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { TOOLS, eventConflicts } from "@/lib/agent/tools";
import { editEventDirect } from "@/lib/agent/handlers/calendar";
import type { CalendarEventKind } from "@/lib/types";

export const GET = api(async ({ profile, url }) => {
  const from = url.searchParams.get("from"), to = url.searchParams.get("to");
  const events = (await getStore().list("calendar_events", profile.id)).filter((e) => e.status === "confirmed" && (!from || e.end_at >= from) && (!to || e.start_at <= to)).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const g = await getGoogle(profile.id);
  const ics = (await getStore().list("integrations", profile.id)).find((i) => i.provider === "ics" && i.status === "connected");
  const [contacts, props] = await Promise.all([getStore().list("contacts", profile.id), getStore().list("properties", profile.id)]);
  const ids = new Set(events.flatMap((e) => [e.contact_id, e.property_id].filter(Boolean)));
  const people = Object.fromEntries(contacts.filter((c) => ids.has(c.id)).map((c) => [c.id, { name: c.name, phone: c.phone, email: c.email, type: c.type }]));
  const places = Object.fromEntries(props.filter((p) => ids.has(p.id)).map((p) => [p.id, { address: p.address, city: p.city, state: p.state, list_price: p.list_price, beds: p.beds, baths: p.baths, sqft: p.sqft, verified: p.verified }]));
  const reminders = (await getStore().list("reminders", profile.id)).filter((r) => r.status === "pending" && (!from || r.remind_at >= from) && (!to || r.remind_at <= to)).sort((a, b) => a.remind_at.localeCompare(b.remind_at)).map((r) => ({ id: r.id, title: r.title, remind_at: r.remind_at, event_id: r.event_id }));
  return { people, places, events, reminders, link: ics ? { connected: true, host: ics.account_label } : { connected: false }, google: g ? { connected: true, account: g.account_label, calendar: g.hasScope("calendar") } : { connected: false } };
});

const KINDS: CalendarEventKind[] = ["showing", "open_house", "call", "meeting", "lunch", "closing", "other"];

// Manual event creation from the Calendar screen. Always checks for conflicts first.
export const POST = api(async ({ profile, req }) => {
  const b = await readJson(req);
  const start = new Date(b.start_at), end = new Date(b.end_at);
  if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 200 || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw bad("Add a title and a valid start and end time.");
  const ctx = await buildCtx(profile);
  // a day that already ended is not something to put on a calendar (or push to Google) without the agent meaning it
  if (end.getTime() < ctx.now.getTime() && b.allowPast !== true) return Response.json({ error: `${new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, weekday: "long", month: "long", day: "numeric" }).format(start)} is in the past. Pick today or a later day.`, code: "past" }, { status: 422 });
  if (!b.ignoreConflicts) {
    const c = await eventConflicts(ctx, start.toISOString(), end.toISOString());
    if (c.length) return Response.json({ error: `That overlaps ${c[0].title}.`, code: "conflict", conflicts: c.map((x) => ({ id: x.id, title: x.title, start_at: x.start_at })) }, { status: 409 });
  }
  const r = await TOOLS.create_calendar_event.run(ctx, { title: b.title.trim(), kind: KINDS.includes(b.kind) ? b.kind : "other", start_at: start.toISOString(), end_at: end.toISOString(), location: b.location ? String(b.location).slice(0, 200) : null, ignoreConflicts: !!b.ignoreConflicts });
  if (!r.ok) throw bad(r.message);
  return r.data;
});

export const DELETE = api(async ({ profile, url }) => {
  if (url.searchParams.get("confirm") !== "1") throw bad("Cancelling needs confirmation.");
  const ctx = await buildCtx(profile);
  const r = await TOOLS.cancel_calendar_event.run(ctx, { id: url.searchParams.get("id") ?? "" });
  if (!r.ok) throw bad(r.message);
  return { ok: true };
});

// Edit an event from the Calendar screen: the agent's own change, so it goes straight through (and to Google when connected).
export const PATCH = api(async ({ profile, req }) => {
  const b = await readJson(req);
  const id = typeof b.id === "string" ? b.id : "";
  const ev = id ? await getStore().get("calendar_events", profile.id, id) : null;
  if (!ev) throw bad("I couldn't find that event.");
  const start = b.start_at ? new Date(b.start_at) : null, end = b.end_at ? new Date(b.end_at) : null;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime())) || (typeof b.title === "string" && (!b.title.trim() || b.title.length > 200))) throw bad("Add a title and a valid start and end time.");
  if ((end ?? new Date(ev.end_at)) <= (start ?? new Date(ev.start_at))) throw bad("The end has to be after the start.");
  const ctx = await buildCtx(profile);
  if (start && !b.ignoreConflicts) {
    const c = await eventConflicts(ctx, (start).toISOString(), (end ?? new Date(start.getTime() + (new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime()))).toISOString(), ev.id);
    if (c.length) return Response.json({ error: `That overlaps ${c[0].title}.`, code: "conflict" }, { status: 409 });
  }
  const r = await editEventDirect(ctx, { id, title: typeof b.title === "string" ? b.title.trim() : undefined, start_at: start?.toISOString(), end_at: (end ?? (start ? new Date(start.getTime() + (new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime())) : null))?.toISOString(), location: typeof b.location === "string" ? b.location.slice(0, 200) : undefined, notes: typeof b.notes === "string" ? b.notes.slice(0, 2000) : undefined });
  if (!r.ok) throw bad(r.message);
  return { ok: true, event: (r.data as { event: unknown }).event, syncNote: (r.data as { syncNote?: string }).syncNote ?? null };
});
