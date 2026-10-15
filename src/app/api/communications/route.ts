import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

const RETENTION_DAYS = 30;

/** Everything Mila has written to people in the last month (emails and texts), plus who is due a follow-up. Older messages are cleared automatically. */
export const GET = api(async ({ profile }) => {
  const store = getStore();
  const since = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const [contacts, drafts, emails, events] = await Promise.all([store.list("contacts", profile.id), store.list("email_drafts", profile.id), store.list("emails", profile.id), store.list("contact_events", profile.id)]);
  const who = new Map(contacts.map((c) => [c.id, c]));
  type M = { id: string; channel: "email" | "text"; contactId: string | null; name: string; subject: string; snippet: string; status: "sent" | "handed_off" | "drafted" | "received"; at: string };
  const out: M[] = [];
  const name = (id: string | null, fallback = "Someone") => (id ? who.get(id)?.name : null) ?? fallback;
  const seenDraft = new Set<string>();
  for (const d of drafts) {
    const at = d.sent_at ?? d.created_at; if (at < since) continue;
    const cid = d.contact_id ?? d.to_contact_ids[0] ?? null; seenDraft.add(d.id);
    out.push({ id: `d-${d.id}`, channel: "email", contactId: cid, name: name(cid, d.to_emails[0] ?? "Someone"), subject: d.subject, snippet: d.body.replace(/\s+/g, " ").slice(0, 140), status: d.status === "sent" ? "sent" : d.status === "approved_unsent" ? "handed_off" : "drafted", at });
  }
  for (const e of emails) {
    if (e.occurred_at < since) continue;
    if (e.external_id && drafts.some((d) => d.gmail_message_id === e.external_id)) continue; // already shown as the draft that sent it
    out.push({ id: `e-${e.id}`, channel: "email", contactId: e.contact_id, name: name(e.contact_id), subject: e.subject, snippet: e.snippet ?? "", status: e.direction === "in" ? "received" : "sent", at: e.occurred_at });
  }
  for (const ev of events) {
    if (ev.kind !== "text" || ev.occurred_at < since) continue;
    out.push({ id: `t-${ev.id}`, channel: "text", contactId: ev.contact_id, name: name(ev.contact_id), subject: "Text", snippet: (ev.detail ?? "").slice(0, 140), status: "drafted", at: ev.occurred_at });
  }
  out.sort((a, b) => b.at.localeCompare(a.at));

  // who is due a follow-up: a set next step that has come due, or a quiet stretch sized by how important the person is
  const now = Date.now(), quiet = { 3: 7, 2: 14, 1: 30 } as Record<number, number>;
  const followUps = contacts.filter((c) => !["closed", "inactive", "nurture"].includes(c.status as string)).map((c) => {
    const last = c.last_contact_at ? new Date(c.last_contact_at).getTime() : new Date(c.created_at).getTime();
    const days = Math.floor((now - last) / 86_400_000);
    const dueStep = c.next_action && c.next_action_at && new Date(c.next_action_at).getTime() <= now;
    const overdue = dueStep || days >= (quiet[c.importance] ?? 30);
    return { id: c.id, name: c.name, type: c.type, phone: c.phone, email: c.email, days, why: dueStep ? `${c.next_action} (due)` : c.last_contact_at ? `No contact for ${days} days` : "You haven't reached out yet", overdue, score: (dueStep ? 1000 : 0) + days + c.importance * 5 };
  }).filter((x) => x.overdue).sort((a, b) => b.score - a.score).slice(0, 25);
  return { messages: out.slice(0, 200), followUps, retentionDays: RETENTION_DAYS };
});
