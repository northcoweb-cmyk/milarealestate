import { buildSignature, withSignature } from "../signature";
import { randomUUID } from "node:crypto";
import { creditCost, ensureCredits } from "../credits";
import { gcal, gmail, getGoogle, GoogleError } from "../integrations/google";
import { fmtDayTime, fmtRange, fmtShortDate, fmtTime, startOfDay, addDays, DAY_MS } from "../time";
import type { Approval, CalendarEvent, CalendarEventKind, Contact, ContactStatus, ContactType, EmailDraft, Memory, Property, Reminder, Task, TaskKind, TaskPriority } from "../types";
import { BULK_EMAIL_CONFIRM_THRESHOLD } from "../config";
import { type Ctx, type ToolResult, fail, ok, pickColor, firstName, plural, label } from "./context";
import { type Gate, mustAsk } from "./policy";
import { bucket, scoreTask } from "./prioritize";
import { listMemories, saveMemory } from "./memory";
import { addrKey } from "./nlu";

/**
 * Tool registry. Tools are the ONLY way Mila changes anything. Each returns a
 * structured ToolResult and consequential ones declare a `gate`, which the
 * autonomy policy turns into an approval when required.
 */

type Args = Record<string, any>;
export interface ToolDef {
  name: string;
  /** concise status line shown while Mila works (no chain-of-thought) */
  status: string;
  gate?: (ctx: Ctx, args: Args) => Promise<Gate | null>;
  run: (ctx: Ctx, args: Args) => Promise<ToolResult>;
}

const nowIso = () => new Date().toISOString();

export async function logContactEvent(ctx: Ctx, contactId: string | null | undefined, kind: string, title: string, detail?: string | null) {
  if (!contactId) return;
  await ctx.store.insert("contact_events", ctx.userId, { contact_id: contactId, kind, title, detail: detail ?? null, occurred_at: nowIso() });
}

// ------------------------------------------------------------------ helpers

export function normPhone(p: string | null | undefined) { return (p ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); }

export async function findDuplicateContact(ctx: Ctx, c: { name?: string | null; email?: string | null; phone?: string | null }): Promise<Contact | null> {
  const all = await ctx.store.list("contacts", ctx.userId);
  const email = c.email?.toLowerCase(), phone = normPhone(c.phone);
  return (
    all.find((x) => email && x.email?.toLowerCase() === email) ??
    all.find((x) => phone.length >= 10 && normPhone(x.phone) === phone) ??
    all.find((x) => c.name && x.name.toLowerCase() === c.name.trim().toLowerCase()) ??
    null
  );
}

export async function eventConflicts(ctx: Ctx, startIso: string, endIso: string, excludeId?: string): Promise<CalendarEvent[]> {
  const s = new Date(startIso).getTime(), e = new Date(endIso).getTime();
  return (await ctx.store.list("calendar_events", ctx.userId)).filter((x) => x.status === "confirmed" && x.id !== excludeId && new Date(x.start_at).getTime() < e && new Date(x.end_at).getTime() > s);
}

/** Next free slots of `durationMin`, 8am–7pm, starting at `from`. */
export async function freeSlots(ctx: Ctx, from: Date, durationMin: number, count = 3, excludeId?: string): Promise<{ start: Date; end: Date }[]> {
  const out: { start: Date; end: Date }[] = [];
  let t = new Date(Math.ceil(from.getTime() / 1_800_000) * 1_800_000);
  for (let i = 0; i < 14 * 48 && out.length < count; i++, t = new Date(t.getTime() + 1_800_000)) {
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, hour: "numeric", hourCycle: "h23" }).format(t));
    if (h < 8 || h >= 19) continue;
    const end = new Date(t.getTime() + durationMin * 60_000);
    const endH = Number(new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, hour: "numeric", hourCycle: "h23", minute: "numeric" }).formatToParts(end).find((p) => p.type === "hour")?.value ?? 0);
    if (endH > 19) continue;
    if (!(await eventConflicts(ctx, t.toISOString(), end.toISOString(), excludeId)).length) out.push({ start: t, end });
  }
  return out;
}

export function eventLabel(ctx: Ctx, e: Pick<CalendarEvent, "title" | "start_at" | "end_at">) {
  return `${e.title}, ${fmtDayTime(e.start_at, ctx.tz)}`;
}

// -------------------------------------------------------------------- tools

export const TOOLS: Record<string, ToolDef> = {
  // ---------------- contacts
  create_contact: {
    name: "create_contact", status: "Saving contact",
    gate: async (ctx, a) => ({ key: "contacts", risk: "normal", action: "other", title: `Add ${a.name}`, summary: `Add ${a.name} as a ${label(a.type ?? "lead").toLowerCase()}.` }),
    run: async (ctx, a) => {
      if (!a.name || !String(a.name).trim()) return fail("invalid", "A contact needs a name.");
      const dup = await findDuplicateContact(ctx, a);
      if (dup) return ok({ contact: dup, existing: true });
      const c = await ctx.store.insert("contacts", ctx.userId, {
        name: String(a.name).trim(), email: a.email ?? null, phone: a.phone ?? null,
        type: (a.type as ContactType) ?? "lead", status: (a.status as ContactStatus) ?? "new",
        tags: a.tags ?? [], notes: a.notes ?? null, preferences: a.preferences ?? {}, location: a.location ?? null,
        budget_min: a.budget_min ?? null, budget_max: a.budget_max ?? null, timeline: a.timeline ?? null,
        source: a.source ?? null, importance: a.importance ?? 2, last_contact_at: null,
        next_action: a.next_action ?? null, next_action_at: a.next_action_at ?? null, avatar_color: pickColor(a.name),
      });
      await logContactEvent(ctx, c.id, "added", `Added as ${label(c.type).toLowerCase()}`, a.source ? `Source: ${a.source}` : null);
      return ok({ contact: c, existing: false });
    },
  },
  update_contact: {
    name: "update_contact", status: "Updating contact",
    run: async (ctx, a) => {
      const cur = await ctx.store.get("contacts", ctx.userId, a.id);
      if (!cur) return fail("not_found", "I couldn't find that contact.");
      const patch: Partial<Contact> = { ...a.patch };
      if (patch.preferences) patch.preferences = { ...cur.preferences, ...patch.preferences };
      if (patch.tags) patch.tags = [...new Set([...(cur.tags ?? []), ...patch.tags])];
      const c = (await ctx.store.update("contacts", ctx.userId, cur.id, patch))!;
      if (patch.status && patch.status !== cur.status) await logContactEvent(ctx, c.id, "status_changed", `Status: ${label(cur.status)} → ${label(c.status)}`);
      else if (a.eventTitle) await logContactEvent(ctx, c.id, a.eventKind ?? "note", a.eventTitle, a.eventDetail);
      return ok({ contact: c });
    },
  },
  delete_contact: {
    name: "delete_contact", status: "Preparing to delete",
    gate: async (ctx, a) => {
      const c = await ctx.store.get("contacts", ctx.userId, a.id);
      return { key: null, risk: "high", action: "delete", title: `Delete ${c?.name ?? "contact"}`, summary: "This permanently removes the contact, their notes and timeline.", contactId: a.id };
    },
    run: async (ctx, a) => {
      const ok1 = await ctx.store.remove("contacts", ctx.userId, a.id);
      if (!ok1) return fail("not_found", "That contact is already gone.");
      await ctx.store.removeWhere("contact_events", ctx.userId, (r) => (r as any).contact_id === a.id);
      await ctx.store.removeWhere("contact_notes", ctx.userId, (r) => (r as any).contact_id === a.id);
      await ctx.store.removeWhere("memories", ctx.userId, (r) => (r as any).scope === "contact" && (r as any).subject_id === a.id);
      return ok({ deleted: a.id });
    },
  },
  search_contacts: {
    name: "search_contacts", status: "Finding relevant contacts",
    run: async (ctx, a) => {
      const q = String(a.query ?? "").toLowerCase().trim();
      let list = await ctx.store.list("contacts", ctx.userId);
      if (a.types?.length) list = list.filter((c) => a.types.includes(c.type));
      if (a.status) list = list.filter((c) => c.status === a.status);
      if (a.tag) list = list.filter((c) => c.tags.some((t) => t.toLowerCase() === String(a.tag).toLowerCase()));
      if (a.hasEmail) list = list.filter((c) => !!c.email);
      if (a.excludeInactive) list = list.filter((c) => c.status !== "inactive" && c.status !== "closed");
      if (q) list = list.filter((c) => [c.name, c.email, c.phone, c.location, c.notes, ...c.tags].some((f) => f?.toLowerCase().includes(q)));
      return ok({ contacts: list.slice(0, a.limit ?? 100) });
    },
  },
  get_contact: {
    name: "get_contact", status: "Looking up contact",
    run: async (ctx, a) => {
      const list = await ctx.store.list("contacts", ctx.userId);
      const q = String(a.name ?? "").toLowerCase().trim();
      const c = a.id ? list.find((x) => x.id === a.id) : null;
      if (c) return ok({ contacts: [c] });
      const exact = list.filter((x) => x.name.toLowerCase() === q);
      if (exact.length) return ok({ contacts: exact });
      const first = list.filter((x) => x.name.toLowerCase().split(/\s+/)[0] === q.split(/\s+/)[0] && (q.split(/\s+/).length === 1 || x.name.toLowerCase().includes(q)));
      return first.length ? ok({ contacts: first }) : fail("not_found", `I don't have anyone named ${a.name} yet.`);
    },
  },

  // ---------------- properties
  create_property: {
    name: "create_property", status: "Finding the property",
    run: async (ctx, a) => {
      const addr = String(a.address).trim();
      // facts the agent stated themselves are authoritative: save them, and mark the property confirmed
      const stated: Record<string, unknown> = {};
      for (const k of ["list_price", "beds", "baths", "sqft"] as const) if (a[k] != null) stated[k] = a[k];
      const hit = (await ctx.store.list("properties", ctx.userId)).find((p) => addrKey(p.address) === addrKey(addr)); // "77 W. Main" and "77 W Main" are the same house
      if (hit) {
        const fill: Record<string, unknown> = {};
        for (const k of ["city", "state", "zip", "county"] as const) if (!hit[k] && a[k]) fill[k] = a[k];
        Object.assign(fill, stated);
        if (Object.keys(stated).length) fill.verified = true;
        return ok({ property: Object.keys(fill).length ? (await ctx.store.update("properties", ctx.userId, hit.id, fill as never)) ?? hit : hit, existing: true });
      }
      const p = await ctx.store.insert("properties", ctx.userId, {
        address: addr, city: a.city ?? null, state: a.state ?? null, zip: a.zip ?? null, county: a.county ?? null,
        list_price: (stated.list_price as number) ?? null, beds: (stated.beds as number) ?? null, baths: (stated.baths as number) ?? null, sqft: (stated.sqft as number) ?? null,
        listing_url: a.listing_url ?? null, description: null, verified: Object.keys(stated).length > 0, is_demo: false,
      });
      return ok({ property: p, existing: false });
    },
  },

  // ---------------- tasks
  create_task: {
    name: "create_task", status: "Creating tasks",
    gate: async (ctx, a) => (a.internal ? null : { key: "tasks", risk: "normal", action: "other", title: a.title, summary: a.subtitle ?? a.title }),
    run: async (ctx, a) => {
      const contact = a.contact_id ? await ctx.store.get("contacts", ctx.userId, a.contact_id) : null;
      const draft: Omit<Task, "id" | "user_id" | "created_at" | "updated_at"> = {
        kind: (a.kind as TaskKind) ?? "task", title: a.title, subtitle: a.subtitle ?? null,
        priority: "low", priority_reason: null, status: "open", due_at: a.due_at ?? null,
        contact_id: a.contact_id ?? null, property_id: a.property_id ?? null, approval_id: a.approval_id ?? null,
        workflow_run_id: a.workflow_run_id ?? null, completed_at: null,
      };
      const { score, reason } = scoreTask(draft as Task, contact ?? undefined, ctx.now);
      draft.priority = (a.priority as TaskPriority) ?? bucket(score);
      draft.priority_reason = reason || null;
      const t = await ctx.store.insert("tasks", ctx.userId, draft);
      return ok({ task: t });
    },
  },
  complete_task: {
    name: "complete_task", status: "Updating task",
    run: async (ctx, a) => {
      const t = await ctx.store.update("tasks", ctx.userId, a.id, { status: a.dismiss ? "dismissed" : "done", completed_at: nowIso() });
      if (!t) return fail("not_found", "I couldn't find that task.");
      if (t.contact_id && !a.dismiss) { await logContactEvent(ctx, t.contact_id, "task_done", `Completed: ${t.title}`); }
      return ok({ task: t });
    },
  },

  // ---------------- reminders
  create_reminder: {
    name: "create_reminder", status: "Setting reminders",
    gate: async (ctx, a) => (a.internal ? null : { key: "reminders", risk: "normal", action: "other", title: `Remind you: ${a.title}`, summary: `${a.title} — ${fmtDayTime(a.remind_at, ctx.tz)}` }),
    run: async (ctx, a) => {
      if (!a.remind_at || Number.isNaN(new Date(a.remind_at).getTime())) return fail("invalid", "I need a valid time for that reminder.");
      const prefs = ctx.profile.settings.notifications.channels;
      const channels: Reminder["channels"] = [prefs.pwa && "pwa", prefs.browser && "browser", prefs.email && "email"].filter(Boolean) as Reminder["channels"];
      const r = await ctx.store.insert("reminders", ctx.userId, {
        title: a.title, remind_at: a.remind_at, channels, status: "pending", contact_id: a.contact_id ?? null,
        event_id: a.event_id ?? null, workflow_run_id: a.workflow_run_id ?? null, delivered_at: null,
      });
      return ok({ reminder: r });
    },
  },

  // ---------------- calendar
  find_calendar_conflicts: {
    name: "find_calendar_conflicts", status: "Checking your calendar",
    run: async (ctx, a) => ok({ conflicts: await eventConflicts(ctx, a.start, a.end, a.excludeId) }),
  },
  find_free_slots: {
    name: "find_free_slots", status: "Finding open times",
    run: async (ctx, a) => ok({ slots: (await freeSlots(ctx, new Date(a.from ?? ctx.now), a.durationMin ?? 60, a.count ?? 3, a.excludeId)).map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })) }),
  },
  create_calendar_event: {
    name: "create_calendar_event", status: "Adding to your calendar",
    gate: async (ctx, a) => ({ key: "calendar", risk: "normal", action: "calendar_create", title: `Add to calendar: ${a.title}`, summary: `${a.title} — ${fmtDayTime(a.start_at, ctx.tz)}${a.location ? ` • ${a.location}` : ""}`, dueAt: a.start_at, contactId: a.contact_id, propertyId: a.property_id }),
    run: async (ctx, a) => {
      const conflicts = a.ignoreConflicts ? [] : await eventConflicts(ctx, a.start_at, a.end_at);
      if (conflicts.length) return fail("invalid", `That overlaps ${conflicts[0].title}. I didn't add it.`);
      let ext: string | null = null, syncedAt: string | null = null, syncNote: string | undefined;
      const google = await getGoogle(ctx.userId);
      if (google?.hasScope("calendar")) {
        try {
          const ge = await gcal.insert(ctx.userId, { summary: a.title, location: a.location, description: a.notes, start: a.start_at, end: a.end_at, tz: ctx.tz });
          ext = ge.id; syncedAt = nowIso();
        } catch (e) { syncNote = e instanceof GoogleError ? e.message : "Google Calendar didn't accept it."; }
      }
      const ev = await ctx.store.insert("calendar_events", ctx.userId, {
        title: a.title, kind: (a.kind as CalendarEventKind) ?? "other", start_at: a.start_at, end_at: a.end_at,
        location: a.location ?? null, property_id: a.property_id ?? null, contact_id: a.contact_id ?? null,
        status: "confirmed", source: "mila", external_id: ext, synced_at: syncedAt, workflow_run_id: a.workflow_run_id ?? null, notes: a.notes ?? null,
      });
      return ok({ event: ev, syncedToGoogle: !!ext, syncNote });
    },
  },
  update_calendar_event: {
    name: "update_calendar_event", status: "Updating your calendar",
    gate: async (ctx, a) => {
      if (a.declared || a.requested) return null; // the user made this change themselves, or just told Mila to: their instruction IS the approval
      const ev = await ctx.store.get("calendar_events", ctx.userId, a.id);
      if (!ev) return null;
      const newStart = a.start_at ?? ev.start_at, newEnd = a.end_at ?? ev.end_at;
      return { key: "calendar_changes", risk: "normal", action: "calendar_change", title: `Move ${ev.title}`, summary: `${fmtDayTime(ev.start_at, ctx.tz)} → ${fmtDayTime(newStart, ctx.tz)}`, dueAt: newStart, contactId: ev.contact_id, propertyId: ev.property_id };
    },
    run: async (ctx, a) => {
      const ev = await ctx.store.get("calendar_events", ctx.userId, a.id);
      if (!ev) return fail("not_found", "I couldn't find that event.");
      const patch: Partial<CalendarEvent> = {};
      if (a.start_at) patch.start_at = a.start_at;
      if (a.end_at) patch.end_at = a.end_at;
      if (a.title) patch.title = a.title;
      let syncNote: string | undefined;
      if (ev.external_id && !a.declared) {
        try { await gcal.patch(ctx.userId, ev.external_id, { summary: a.title, start: a.start_at, end: a.end_at, tz: ctx.tz }); patch.synced_at = nowIso(); }
        catch (e) { syncNote = e instanceof GoogleError ? e.message : "Google Calendar didn't accept the change."; }
      } else if (ev.external_id && a.declared) {
        syncNote = "Your Google Calendar wasn't changed by me — I only updated Mila's record.";
      }
      const updated = (await ctx.store.update("calendar_events", ctx.userId, ev.id, patch))!;
      await logContactEvent(ctx, ev.contact_id, "calendar_changed", `${ev.title} moved to ${fmtDayTime(updated.start_at, ctx.tz)}`);
      return ok({ event: updated, before: ev, syncNote });
    },
  },
  cancel_calendar_event: {
    name: "cancel_calendar_event", status: "Preparing to cancel",
    gate: async (ctx, a) => {
      const ids: string[] = a.ids ?? [a.id];
      const evs = (await Promise.all(ids.map((id) => ctx.store.get("calendar_events", ctx.userId, id)))).filter(Boolean) as CalendarEvent[];
      if (evs.length > 1) return { key: null, risk: "high", action: "calendar_cancel", title: `Cancel ${evs.length} events`, summary: evs.slice(0, 3).map((e) => `${e.title} (${fmtDayTime(e.start_at, ctx.tz)})`).join("; ") + (evs.length > 3 ? ` and ${evs.length - 3} more` : "") };
      const ev = evs[0];
      return { key: null, risk: "high", action: "calendar_cancel", title: `Cancel ${ev?.title ?? "event"}`, summary: ev ? `${fmtDayTime(ev.start_at, ctx.tz)} will be cancelled.` : "Cancel event", contactId: ev?.contact_id };
    },
    run: async (ctx, a) => {
      const ids: string[] = a.ids ?? [a.id];
      let n = 0;
      for (const id of ids) {
        const ev = await ctx.store.get("calendar_events", ctx.userId, id);
        if (!ev || ev.status === "cancelled") continue;
        if (ev.external_id) { try { await gcal.remove(ctx.userId, ev.external_id); } catch { /* keep local state authoritative */ } }
        await ctx.store.update("calendar_events", ctx.userId, ev.id, { status: "cancelled" });
        await logContactEvent(ctx, ev.contact_id, "calendar_cancelled", `${ev.title} cancelled`);
        n++;
      }
      return n ? ok({ cancelled: n }) : fail("not_found", "I couldn't find those events.");
    },
  },

  // ---------------- email
  draft_email: {
    name: "draft_email", status: "Preparing messages",
    gate: async () => null,
    run: async (ctx, a) => {
      const d = await ctx.store.insert("email_drafts", ctx.userId, {
        contact_id: a.contact_id ?? null, to_contact_ids: a.to_contact_ids ?? (a.contact_id ? [a.contact_id] : []), to_emails: a.to_emails ?? [],
        subject: a.subject, body: a.body, status: "draft", workflow_run_id: a.workflow_run_id ?? null, property_id: a.property_id ?? null,
        event_id: a.event_id ?? null, stale: false, stale_reason: null, gmail_message_id: null, sent_at: null,
      });
      return ok({ draft: d });
    },
  },
  send_email: {
    name: "send_email", status: "Sending email",
    gate: async (ctx, a) => {
      const d = await ctx.store.get("email_drafts", ctx.userId, a.draftId);
      const n = d ? recipientCount(d) : 0;
      return { key: "email_sending", risk: n > BULK_EMAIL_CONFIRM_THRESHOLD ? "high" : "normal", action: n > 1 ? "send_bulk_email" : "send_email", title: d ? `${d.subject}` : "Send email", summary: `${plural(n, "recipient")} • Subject: ${d?.subject ?? ""}`, contactId: d?.contact_id, propertyId: d?.property_id };
    },
    run: async (ctx, a) => sendDrafts(ctx, [a.draftId]),
  },
  send_email_batch: {
    name: "send_email_batch", status: "Sending emails",
    gate: async (ctx, a) => {
      const ds = (await Promise.all((a.draftIds as string[]).map((id) => ctx.store.get("email_drafts", ctx.userId, id)))).filter(Boolean) as EmailDraft[];
      const n = ds.reduce((s, d) => s + recipientCount(d), 0);
      return { key: "email_sending", risk: n > BULK_EMAIL_CONFIRM_THRESHOLD ? "high" : "normal", action: "send_bulk_email", title: a.title ?? `${plural(ds.length, "email")}`, summary: `${plural(n, "recipient")}, each personalized` };
    },
    run: async (ctx, a) => sendDrafts(ctx, a.draftIds),
  },
  search_email: {
    name: "search_email", status: "Searching your email",
    run: async (ctx, a) => {
      const g = await getGoogle(ctx.userId);
      if (!g?.hasScope("gmail")) return fail("not_connected", "Your Gmail isn't connected yet.", "google");
      try { return ok({ messages: await gmail.search(ctx.userId, a.query, a.max ?? 8) }); }
      catch (e) { return googleFail(e); }
    },
  },

  // ---------------- sms (not implemented)
  send_sms: {
    name: "send_sms", status: "Preparing text message",
    gate: async (ctx, a) => ({ key: "sms", risk: "normal", action: "send_sms", title: `Text ${a.toName ?? "contact"}`, summary: String(a.body).slice(0, 140) }),
    run: async () => fail("coming_soon", "Text messaging isn't available yet. It's coming soon.", "twilio"),
  },

  // ---------------- social
  create_social_post: {
    name: "create_social_post", status: "Designing the post",
    run: async (ctx, a) => {
      const p = await ctx.store.insert("social_posts", ctx.userId, {
        platform: a.platform ?? "instagram", caption: withSignature(String(a.caption ?? ""), buildSignature(ctx.profile)), hashtags: a.hashtags ?? [], slides: a.slides ?? [], status: "draft",
        property_id: a.property_id ?? null, event_id: a.event_id ?? null, workflow_run_id: a.workflow_run_id ?? null,
        scheduled_for: a.scheduled_for ?? null, stale: false, stale_reason: null,
      });
      return ok({ post: p });
    },
  },
  publish_social_post: {
    name: "publish_social_post", status: "Publishing post",
    gate: async (ctx, a) => {
      const p = await ctx.store.get("social_posts", ctx.userId, a.postId);
      return { key: "social_posts", risk: "normal", action: "publish_social", title: `${label(p?.platform ?? "instagram")} post`, summary: p ? p.caption.split("\n")[0] : "Publish post", propertyId: p?.property_id };
    },
    run: async (ctx, a) => {
      await ctx.store.update("social_posts", ctx.userId, a.postId, { status: "approved_unpublished" });
      return fail("coming_soon", "Approved. Automatic posting isn't available yet — copy the caption and slides to post it yourself.", "meta");
    },
  },

  // ---------------- memory
  get_user_memory: {
    name: "get_user_memory", status: "Recalling what I know",
    run: async (ctx, a) => ok({ memories: await listMemories(ctx, a) }),
  },
  save_memory: {
    name: "save_memory", status: "Remembering that",
    run: async (ctx, a) => ok({ memory: await saveMemory(ctx, a as any) }),
  },
  update_memory: {
    name: "update_memory", status: "Updating memory",
    run: async (ctx, a) => {
      const m = await ctx.store.update("memories", ctx.userId, a.id, { value: a.value, source: "user_stated", confidence: 1 } as Partial<Memory>);
      return m ? ok({ memory: m }) : fail("not_found", "I couldn't find that memory.");
    },
  },
  delete_memory: {
    name: "delete_memory", status: "Forgetting that",
    run: async (ctx, a) => ((await ctx.store.remove("memories", ctx.userId, a.id)) ? ok({}) : fail("not_found", "I couldn't find that memory.")),
  },

  // ---------------- documents
  search_documents: {
    name: "search_documents", status: "Searching your documents",
    run: async (ctx, a) => {
      const q = String(a.query ?? "").toLowerCase();
      const docs = (await ctx.store.list("documents", ctx.userId)).filter((d) => d.name.toLowerCase().includes(q) || d.text_content?.toLowerCase().includes(q) || d.summary?.toLowerCase().includes(q));
      return ok({ documents: docs.slice(0, 20) });
    },
  },
};

export function recipientCount(d: EmailDraft) { return new Set([...d.to_emails.map((e) => e.toLowerCase())]).size + d.to_contact_ids.length - 0; }

function googleFail(e: unknown): ToolResult<never> {
  if (e instanceof GoogleError) return fail(e.code === "api" ? "failed" : "not_connected", e.message, "google");
  return fail("failed", e instanceof Error ? e.message : "Something went wrong talking to Google.");
}

async function sendDrafts(ctx: Ctx, draftIds: string[]): Promise<ToolResult> {
  const google = await getGoogle(ctx.userId);
  const drafts = (await Promise.all(draftIds.map((id) => ctx.store.get("email_drafts", ctx.userId, id)))).filter(Boolean) as EmailDraft[];
  if (!drafts.length) return fail("not_found", "I couldn't find those drafts.");
  if (!google?.hasScope("gmail")) {
    for (const d of drafts) await ctx.store.update("email_drafts", ctx.userId, d.id, { status: "approved_unsent" });
    return fail("not_connected", "Your Gmail isn't connected yet, so nothing was sent.", "google");
  }
  let sent = 0, failed = 0, lastError = "";
  for (const d of drafts) {
    const contacts = (await Promise.all(d.to_contact_ids.map((id) => ctx.store.get("contacts", ctx.userId, id)))).filter(Boolean) as Contact[];
    const targets = [...contacts.filter((c) => c.email).map((c) => ({ email: c.email!, name: c.name, id: c.id as string | null })), ...d.to_emails.map((e) => ({ email: e, name: "", id: null as string | null }))];
    const seen = new Set<string>();
    let draftOk = true;
    for (const t of targets) {
      if (seen.has(t.email.toLowerCase())) continue;
      seen.add(t.email.toLowerCase());
      const body = d.body.replaceAll("{{first_name}}", t.name ? firstName(t.name) : "there");
      try {
        const r = await gmail.send(ctx.userId, [t.email], d.subject, body);
        sent++;
        await ctx.store.insert("emails", ctx.userId, { contact_id: t.id, direction: "out", subject: d.subject, snippet: body.slice(0, 160), external_id: r.id, occurred_at: nowIso() });
        if (t.id) {
          await ctx.store.update("contacts", ctx.userId, t.id, { last_contact_at: nowIso() });
          await logContactEvent(ctx, t.id, "email_sent", `Email sent: ${d.subject}`);
        }
      } catch (e) { failed++; draftOk = false; lastError = e instanceof Error ? e.message : "send failed"; }
    }
    await ctx.store.update("email_drafts", ctx.userId, d.id, { status: draftOk ? "sent" : "failed", sent_at: draftOk ? nowIso() : null });
  }
  if (failed && !sent) return fail("failed", `I couldn't send those: ${lastError}`, "google");
  return ok({ sent, failed, note: failed ? `${failed} didn't go through.` : undefined });
}

// ------------------------------------------------------------ invocation

export type InvokeOutcome =
  | { status: "done"; result: ToolResult }
  | { status: "needs_approval"; approval: Approval; task: Task };

export async function createApproval(ctx: Ctx, gate: Gate, tool: string, args: Args, runId?: string | null): Promise<{ approval: Approval; task: Task }> {
  // De-duplicate: identical pending approval already exists
  const key = JSON.stringify({ tool, args });
  const existing = (await ctx.store.list("approvals", ctx.userId)).find((a) => a.status === "pending" && JSON.stringify(a.payload) === key);
  if (existing) {
    const t = (await ctx.store.list("tasks", ctx.userId)).find((x) => x.approval_id === existing.id)!;
    return { approval: existing, task: t };
  }
  const approval = await ctx.store.insert("approvals", ctx.userId, {
    action: gate.action, title: gate.title, summary: gate.summary, payload: { tool, args }, risk: gate.risk, status: "pending",
    result: null, error: null, blocked_integration: null, workflow_run_id: runId ?? null, decided_at: null, executed_at: null,
  });
  const contact = gate.contactId ? await ctx.store.get("contacts", ctx.userId, gate.contactId) : null;
  const draftTask = { due_at: gate.dueAt ?? null, kind: "approval", status: "open", priority: "low" } as Task;
  const sc = scoreTask(draftTask, contact ?? undefined, ctx.now);
  const t = await TOOLS.create_task.run(ctx, {
    kind: "approval", title: gate.title, subtitle: gate.summary, due_at: gate.dueAt ?? null, contact_id: gate.contactId, property_id: gate.propertyId,
    approval_id: approval.id, workflow_run_id: runId, internal: true,
    // approvals are time-sensitive only if the thing they gate is
    priority: gate.dueAt && new Date(gate.dueAt).getTime() - ctx.now.getTime() < 3 * 86_400_000 ? (sc.score >= 55 ? "urgent" : "important") : "important",
  });
  return { approval, task: (t as any).data.task };
}

export async function invoke(ctx: Ctx, name: string, args: Args, opts: { approved?: boolean; runId?: string | null } = {}): Promise<InvokeOutcome> {
  const tool = TOOLS[name];
  if (!tool) return { status: "done", result: fail("invalid", `Unknown tool ${name}`) };
  ctx.steps.push(tool.status);
  if (tool.gate && !opts.approved) {
    const gate = await tool.gate(ctx, args);
    if (gate && mustAsk(ctx.profile, gate)) {
      const { approval, task } = await createApproval(ctx, gate, name, args, opts.runId);
      return { status: "needs_approval", approval, task };
    }
  }
  const result = await tool.run(ctx, { ...args, workflow_run_id: args.workflow_run_id ?? opts.runId ?? undefined });
  return { status: "done", result };
}

export interface DecisionOutcome { approval: Approval; result?: ToolResult; followUp?: import("../types").Block[]; message: string }

/** Approve (and execute) or reject a pending approval. Never claims success that didn't happen. */
const deciding = new Set<string>();
export async function decideApproval(ctx: Ctx, id: string, decision: "approve" | "reject"): Promise<DecisionOutcome> {
  // A double-click / replayed request must not run the same approval (e.g. send the same email) twice at once.
  const lock = `${ctx.userId}:${id}`;
  if (deciding.has(lock)) {
    const cur = await ctx.store.get("approvals", ctx.userId, id);
    if (!cur) throw new Error("Approval not found");
    return { approval: cur, message: "That's already being handled." };
  }
  deciding.add(lock);
  try { return await decideApprovalOnce(ctx, id, decision); } finally { deciding.delete(lock); }
}

async function decideApprovalOnce(ctx: Ctx, id: string, decision: "approve" | "reject"): Promise<DecisionOutcome> {
  const a = await ctx.store.get("approvals", ctx.userId, id);
  if (!a) throw new Error("Approval not found");
  const task = (await ctx.store.list("tasks", ctx.userId)).find((t) => t.approval_id === id);
  if (a.status !== "pending" && !(a.status === "approved" && a.blocked_integration)) return { approval: a, message: "That was already handled." };

  if (decision === "reject") {
    const u = (await ctx.store.update("approvals", ctx.userId, id, { status: "rejected", decided_at: nowIso() }))!;
    if (task) await ctx.store.update("tasks", ctx.userId, task.id, { status: "dismissed", completed_at: nowIso() });
    if (a.payload.tool === "send_email" || a.payload.tool === "send_email_batch") {
      for (const did of (a.payload.args.draftIds ?? [a.payload.args.draftId]) as string[]) await ctx.store.update("email_drafts", ctx.userId, did, { status: "draft" });
    }
    return { approval: u, message: "Okay — I won't do that." };
  }

  await ensureCredits(ctx.userId, 0);
  const out = await invoke(ctx, a.payload.tool, a.payload.args, { approved: true, runId: a.workflow_run_id });
  if (out.status !== "done") return { approval: a, message: "Still needs approval." };
  const r = out.result;

  if (r.ok) {
    const u = (await ctx.store.update("approvals", ctx.userId, id, { status: "executed", decided_at: nowIso(), executed_at: nowIso(), result: r.data as any, error: null, blocked_integration: null }))!;
    if (task) await ctx.store.update("tasks", ctx.userId, task.id, { status: "done", completed_at: nowIso() });
    const followUp = await postExecute(ctx, a, r.data);
    const sent = a.payload.tool.startsWith("send_email") ? `Sent ${plural((r.data as any).sent ?? 1, "email")}.` : "Done.";
    return { approval: u, result: r, followUp, message: (r.data as any)?.syncNote ? `${sent} Note: ${(r.data as any).syncNote}` : sent };
  }

  // Not executed. Keep honest state.
  if (r.code === "not_connected" || r.code === "coming_soon") {
    const u = (await ctx.store.update("approvals", ctx.userId, id, { status: "approved", decided_at: nowIso(), error: r.message, blocked_integration: r.integration ?? null }))!;
    if (task) await ctx.store.update("tasks", ctx.userId, task.id, { kind: "communication", title: r.code === "coming_soon" ? `Post manually: ${a.title}` : `Connect to finish: ${a.title}`, subtitle: r.message, status: r.code === "coming_soon" ? "open" : "open" });
    return { approval: u, result: r, message: r.message };
  }
  const u = (await ctx.store.update("approvals", ctx.userId, id, { status: "failed", decided_at: nowIso(), error: r.message }))!;
  return { approval: u, result: r, message: r.message };
}

async function postExecute(ctx: Ctx, a: Approval, data: any): Promise<import("../types").Block[]> {
  if (a.payload.tool === "update_calendar_event" && data?.event && data?.before) {
    const { markCommsStale } = await import("./handlers/calendar");
    return markCommsStale(ctx, data.before as CalendarEvent, data.event as CalendarEvent);
  }
  return [];
}

export const stepLabel = (name: string) => TOOLS[name]?.status ?? name;
export { fmtRange, fmtShortDate, fmtTime, startOfDay, addDays, DAY_MS, randomUUID, creditCost };
export type { Property };
