import { api, bad, notFound, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { buildCtx } from "@/lib/agent/engine";

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const first = (n: string) => n.trim().split(/\s+/)[0] ?? "";

/**
 * Email approvals no longer send through a background connection. This returns the finished message (recipients, subject, body)
 * so the browser can open the person's own email app with it, and records that the draft was handed off.
 */
export const POST = api<{ id: string }>(async ({ profile, params, req }) => {
  rateLimit(`compose:${profile.id}`, 60);
  const b = await readJson<{ draftId: string; subject?: string; body?: string }>(req);
  const ctx = await buildCtx(profile);
  const approval = await ctx.store.get("approvals", profile.id, params.id);
  if (!approval) throw notFound("That email");
  const args = approval.payload.args as { draftId?: string; draftIds?: string[] };
  const ids = args.draftIds ?? (args.draftId ? [args.draftId] : []);
  if (!ids.includes(b.draftId)) throw bad("That draft isn't part of this request.");
  let draft = await ctx.store.get("email_drafts", profile.id, b.draftId);
  if (!draft) throw notFound("That email");
  const patch: Record<string, string> = {};
  if (typeof b.subject === "string") patch.subject = b.subject.slice(0, 300);
  if (typeof b.body === "string") patch.body = b.body.slice(0, 20_000);
  if (Object.keys(patch).length) draft = (await ctx.store.update("email_drafts", profile.id, draft.id, patch as never)) ?? draft;

  const contacts = await ctx.store.list("contacts", profile.id);
  const people = [...new Set([...(draft.contact_id ? [draft.contact_id] : []), ...draft.to_contact_ids])].map((id) => contacts.find((c) => c.id === id)).filter(Boolean) as typeof contacts;
  const emails = [...new Set([...people.map((c) => c.email ?? ""), ...draft.to_emails].map((e) => e.trim()).filter((e) => EMAIL.test(e)))];
  const single = emails.length === 1;
  const body = draft.body.replaceAll("{{first_name}}", single && people[0] ? first(people[0].name) : "there");

  await ctx.store.update("email_drafts", profile.id, draft.id, { status: "approved_unsent" } as never);
  const all = await Promise.all(ids.map((id) => ctx.store.get("email_drafts", profile.id, id)));
  const remaining = all.filter((d) => d && d.status !== "approved_unsent" && d.status !== "sent").length;
  if (!remaining && approval.status === "pending") await ctx.store.update("approvals", profile.id, approval.id, { status: "executed", decided_at: new Date().toISOString(), executed_at: new Date().toISOString(), result: { via: "mail_app" }, error: null, blocked_integration: null } as never);
  // log it on the contact so their history shows the email
  for (const c of people.slice(0, 20)) await ctx.store.insert("contact_events", profile.id, { contact_id: c.id, kind: "email_sent", title: `Emailed: ${draft.subject}`.slice(0, 160), detail: null, occurred_at: new Date().toISOString() }).catch(() => undefined);

  return { to: single ? emails : [], bcc: single ? [] : emails, subject: draft.subject, body, from: profile.email, remaining, recipients: emails.length };
});
