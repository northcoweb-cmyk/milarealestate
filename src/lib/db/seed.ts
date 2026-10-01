import { buildCtx } from "../agent/engine";
import { pickColor } from "../agent/context";
import { createApproval } from "../agent/tools";
import { addDays, partsIn, zonedToUtc } from "../time";
import type { Contact, ContactStatus, ContactType, Profile } from "../types";
import { getStore } from "./store";

/**
 * Demo data: clearly fictional (example.com emails, 555-01xx phones,
 * invented properties flagged is_demo). Never presented as MLS data.
 */
const C = (name: string, type: ContactType, status: ContactStatus, extra: Partial<Contact> & { daysAgo?: number | null }) => ({ name, type, status, ...extra });

const CONTACTS = [
  C("Sarah Johnson", "buyer", "showing", { budget_max: 650000, budget_min: 600000, location: "Montgomery County, MD", timeline: "Next 3 months", preferences: { beds_min: 3, features: ["Garage"] }, importance: 3, daysAgo: 3, next_action: "Follow up about yesterday's showing", notes: "Pre-approved. Prefers a quiet street." }),
  C("John Smith", "buyer", "active", { budget_max: 520000, location: "Gaithersburg, MD", timeline: "Next 2 months", preferences: { beds_min: 3 }, importance: 3, daysAgo: 5, next_action: "Confirm tomorrow's appointment", notes: "Asked about FHA vs conventional financing." }),
  C("Priya Patel", "buyer", "qualified", { budget_max: 780000, location: "Rockville, MD", timeline: "Next 4 months", preferences: { beds_min: 4, features: ["Good schools", "Yard"] }, importance: 3, daysAgo: 2 }),
  C("Michael Chen", "seller", "active", { budget_max: 910000, location: "Bethesda, MD", timeline: "Listing in spring", importance: 3, daysAgo: 1, next_action: "Review pricing strategy", notes: "Considering a pre-listing refresh." }),
  C("Emily Rodriguez", "lead", "new", { location: "Germantown, MD", timeline: "Exploring", importance: 2, daysAgo: null, notes: "Inquired through the website." }),
  C("David Kim", "investor", "active", { budget_max: 1200000, location: "Northern Virginia", timeline: "Ongoing", importance: 2, daysAgo: 9, preferences: { property_types: ["Multi-family"] } }),
  C("Olivia Brooks", "past_client", "closed", { location: "Silver Spring, MD", importance: 2, daysAgo: 120, next_action: "Anniversary check-in" }),
  C("Marcus Johnson", "rental", "active", { budget_max: 2800, location: "Arlington, VA", timeline: "Next month", importance: 1, daysAgo: 4 }),
  C("Linda Alvarez", "past_client", "closed", { location: "Gaithersburg, MD", importance: 2, daysAgo: 200 }),
  C("Aisha Rahman", "buyer", "showing", { budget_max: 560000, location: "Gaithersburg, MD", timeline: "Next 6 weeks", preferences: { beds_min: 3, features: ["Townhome"] }, importance: 3, daysAgo: 1 }),
  C("Kevin O'Brien", "lead", "contacted", { location: "Frederick, MD", importance: 1, daysAgo: 6 }),
  C("Grace Liu", "buyer", "nurture", { budget_max: 480000, location: "Montgomery Village, MD", timeline: "Within a year", importance: 1, daysAgo: 24 }),
  C("Robert Hayes", "seller", "qualified", { budget_max: 735000, location: "Potomac, MD", timeline: "Next 3 months", importance: 2, daysAgo: 7 }),
  C("Natalie Cruz", "lead", "new", { location: "Clarksburg, MD", importance: 2, daysAgo: null, notes: "Met at a community event." }),
  C("Tom Becker", "vendor", "active", { notes: "Home inspector — Becker Inspections.", importance: 1, daysAgo: 30 }),
  C("Daniel Foster", "agent", "active", { notes: "Referral partner (fictional brokerage).", importance: 1, daysAgo: 45 }),
];

export async function seedDemoData(profile: Profile) {
  const ctx = await buildCtx(profile);
  const { store, userId, tz, now } = ctx;
  if ((await store.list("contacts", userId)).length) return;
  const at = (dayOffset: number, h: number, mi = 0) => { const p = partsIn(addDays(now, dayOffset, tz), tz); return zonedToUtc(p.y, p.m, p.d, h, mi, tz); };
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

  const byName: Record<string, Contact> = {};
  for (const [i, c] of CONTACTS.entries()) {
    const { daysAgo, ...rest } = c as typeof c & { daysAgo?: number | null };
    const slug = c.name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/\.$/, "");
    const row = await store.insert("contacts", userId, {
      name: c.name, email: c.type === "vendor" || c.type === "agent" ? `${slug}@example.com` : `${slug}@example.com`, phone: `(301) 555-01${String(10 + i).padStart(2, "0")}`,
      type: c.type, status: c.status, tags: [], notes: rest.notes ?? null, preferences: rest.preferences ?? {}, location: rest.location ?? null,
      budget_min: rest.budget_min ?? null, budget_max: rest.budget_max ?? null, timeline: rest.timeline ?? null, source: "Demo data",
      importance: (rest.importance ?? 2) as 1 | 2 | 3, last_contact_at: daysAgo == null ? null : ago(daysAgo), next_action: rest.next_action ?? null,
      next_action_at: rest.next_action ? at(0, 17).toISOString() : null, avatar_color: pickColor(c.name), created_at: ago(daysAgo == null ? 0.3 : 40), updated_at: ago(0),
    } as any);
    byName[c.name] = row;
    await store.insert("contact_events", userId, { contact_id: row.id, kind: "added", title: `Added as ${c.type.replace("_", " ")}`, detail: "Demo data", occurred_at: ago(daysAgo == null ? 0.3 : (daysAgo ?? 0) + 14) });
    if (daysAgo != null && daysAgo < 60) await store.insert("contact_events", userId, { contact_id: row.id, kind: "email_sent", title: "Email sent: Checking in", detail: null, occurred_at: ago(daysAgo) });
  }
  const sj = byName["Sarah Johnson"];
  await store.insert("contact_events", userId, { contact_id: sj.id, kind: "showing", title: "Showing — 456 Oak Lane", detail: "Liked the kitchen; concerned about the busy road.", occurred_at: ago(1) });
  await store.insert("memories", userId, { scope: "contact", subject_id: sj.id, key: "Search criteria", value: "3+ bedrooms • Garage • Montgomery County • ~$650,000 • Timeline: Next 3 months", source: "user_stated", confidence: 1, pinned: false });
  await store.insert("memories", userId, { scope: "user", subject_id: null, key: "Email style", value: "Warm and brief. Sign off with first name only.", source: "user_stated", confidence: 1, pinned: true });
  await store.insert("memories", userId, { scope: "business", subject_id: null, key: "Primary market", value: "Montgomery County, MD (Gaithersburg, Rockville, Germantown)", source: "user_stated", confidence: 1, pinned: false });

  const props = [
    { address: "123 Main Street", city: "Gaithersburg", state: "MD", zip: "20877", county: "Montgomery", list_price: 589000, beds: 3, baths: 2.5, sqft: 2150, description: "Fictional demo listing." },
    { address: "456 Oak Lane", city: "Rockville", state: "MD", zip: "20850", county: "Montgomery", list_price: 699000, beds: 4, baths: 3, sqft: 2640, description: "Fictional demo listing." },
    { address: "88 Willow Court", city: "Germantown", state: "MD", zip: "20874", county: "Montgomery", list_price: null, beds: null, baths: null, sqft: null, description: null },
  ];
  const pr: Record<string, string> = {};
  for (const p of props) {
    const row = await store.insert("properties", userId, { ...p, listing_url: null, verified: !!p.list_price, is_demo: true } as any);
    pr[p.address] = row.id;
  }

  const ev = async (title: string, kind: any, start: Date, mins: number, extra: any = {}) =>
    store.insert("calendar_events", userId, { title, kind, start_at: start.toISOString(), end_at: new Date(start.getTime() + mins * 60_000).toISOString(), location: null, property_id: null, contact_id: null, status: "confirmed", source: "mila", external_id: null, synced_at: null, workflow_run_id: null, notes: null, ...extra });
  await ev("Showing — 456 Oak Lane", "showing", at(0, 10), 45, { location: "456 Oak Lane, Rockville", property_id: pr["456 Oak Lane"], contact_id: byName["Priya Patel"].id });
  await ev("Lunch with John Smith", "lunch", at(0, 13), 60, { contact_id: byName["John Smith"].id });
  await ev("Client call — Michael Chen", "call", at(0, 15), 30, { contact_id: byName["Michael Chen"].id });
  const showing = await ev("Showing — 123 Main Street", "showing", at(1, 11), 45, { location: "123 Main Street, Gaithersburg", property_id: pr["123 Main Street"], contact_id: byName["Aisha Rahman"].id });
  await ev("Listing consultation — Robert Hayes", "meeting", at(2, 9, 30), 60, { contact_id: byName["Robert Hayes"].id });
  await ev("Inspection — 88 Willow Court", "other", at(4, 10), 120, { property_id: pr["88 Willow Court"] });

  // tasks
  const mk = (kind: any, title: string, subtitle: string | null, priority: any, dueH: number, contact?: string, reason?: string) =>
    store.insert("tasks", userId, { kind, title, subtitle, priority, priority_reason: reason ?? null, status: "open", due_at: new Date(now.getTime() + dueH * 3_600_000).toISOString(), contact_id: contact ? byName[contact].id : null, property_id: null, approval_id: null, workflow_run_id: null, completed_at: null });
  await mk("follow_up", "Follow up about yesterday's showing", "Ask about the kitchen and the road noise", "urgent", 3, "Sarah Johnson", "showing stage · due today");
  await mk("follow_up", "Confirm tomorrow's appointment", null, "important", 8, "Aisha Rahman", "due today");
  await mk("follow_up", "Send market snapshot", "Seller pricing prep", "upcoming", 48, "Michael Chen");
  await mk("reminder", "Order yard signs for 88 Willow Court", null, "low", 96);

  // approvals (executable): email blast + calendar change
  const buyers = Object.values(byName).filter((c) => ["buyer", "lead", "past_client"].includes(c.type));
  const draft = await store.insert("email_drafts", userId, { contact_id: null, to_contact_ids: buyers.map((c) => c.id), to_emails: [], subject: "Just Listed — 456 Oak Lane", body: "Hi {{first_name}},\n\nI am excited to share a new listing at 456 Oak Lane, Rockville — 4 bed • 3 bath • 2,640 sq ft. Reply if you would like a private showing.\n\n" + ctx.profile.full_name, status: "pending_approval", workflow_run_id: null, property_id: pr["456 Oak Lane"], event_id: null, stale: false, stale_reason: null, gmail_message_id: null, sent_at: null });
  await createApproval(ctx, { key: "email_sending", risk: buyers.length > 10 ? "high" : "normal", action: "send_bulk_email", title: "Just Listed Email", summary: `${buyers.length} recipients • 456 Oak Lane`, dueAt: at(1, 9).toISOString() }, "send_email", { draftId: draft.id });
  await createApproval(ctx, { key: "calendar_changes", risk: "normal", action: "calendar_change", title: "Move showing for Aisha Rahman", summary: "Tomorrow 11:00 AM → 2:00 PM", dueAt: at(1, 14).toISOString(), contactId: byName["Aisha Rahman"].id }, "update_calendar_event", { id: showing.id, start_at: at(1, 14).toISOString(), end_at: at(1, 14, 45).toISOString() });

  // a default buyer-agreement template
  const body = "BUYER REPRESENTATION AGREEMENT (SAMPLE — NOT LEGAL ADVICE)\n\nClient: {{CLIENT_NAME}}\nDate: {{DATE}}\nAgent: {{AGENT_NAME}} — {{BROKERAGE}}\n\n[Replace this sample with your own broker-approved form. Mila only fills the {{VARIABLES}} and never edits the wording.]";
  await store.insert("document_templates", userId, { name: "Buyer agreement (sample)", kind: "buyer_document", body, variables: ["CLIENT_NAME", "DATE", "AGENT_NAME", "BROKERAGE"], document_id: null, is_default: false });
  await store.insert("notifications", userId, { channel: "pwa", title: "Demo data loaded", body: "Everything here is fictional.", status: "queued", related_task_id: null });
}


export { getStore };
