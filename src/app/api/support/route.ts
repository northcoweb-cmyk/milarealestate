import { randomUUID } from "node:crypto";
import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { getStore } from "@/lib/db/store";
import { sendEmailNotification } from "@/lib/notify";
import { creditSummary } from "@/lib/credits";
import { logError } from "@/lib/server/errors";
import { brandedEmail } from "@/lib/email-template";

const TOPICS = ["billing", "refund", "bug", "account", "question", "other"] as const;
const LABEL: Record<string, string> = { billing: "Billing", refund: "Refund request", bug: "Something isn't working", account: "My account", question: "A question", other: "Something else" };
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** A support ticket from inside Mila. Stored for the owner (Mila OS → Support), with the person's reply-to email, and an email alert to the owner when email is configured. */
export const POST = api(async ({ profile, req }) => {
  rateLimit(`ticket:${profile.id}`, 6, 24 * 60 * 60_000);
  const b = await readJson<{ name?: unknown; email?: unknown; topic?: unknown; subject?: unknown; message?: unknown; attachmentIds?: unknown }>(req);
  const name = clip(b.name, 120) || profile.full_name, email = clip(b.email, 254).toLowerCase();
  const topic = (TOPICS as readonly string[]).includes(String(b.topic)) ? String(b.topic) : "other";
  const subject = clip(b.subject, 140), message = clip(b.message, 5000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw bad("Enter an email we can reply to.");
  if (message.length < 10) throw bad("Tell us a little more so we can help (at least a sentence).");
  const store = getStore();
  const ids = (Array.isArray(b.attachmentIds) ? b.attachmentIds : []).map(String).slice(0, 5);
  const files: { id: string; name: string; mime: string; size: number }[] = [];
  for (const id of ids) { const d = await store.get("documents", profile.id, id); if (d) files.push({ id: d.id, name: d.name, mime: d.mime, size: d.size_bytes }); } // only the sender's own uploads
  const s = await creditSummary(profile.id).catch(() => null);
  const ticketNo = `M-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const context = { kind: "support_ticket", ticket_no: ticketNo, name, email, topic, topic_label: LABEL[topic], subject: subject || LABEL[topic], attachments: files, plan: s?.plan?.name ?? null, status: s?.status ?? null, credits_used_this_period: s?.spentThisPeriod ?? null, user_email: profile.email, created: new Date().toISOString(), triage: { severity: null, owner: "Ryan", resolution: null } };
  const row = await store.insert("feedback", profile.id, { id: randomUUID(), kind: "bug", target: "support", target_id: null, note: message, snippet: null, page: "/settings/support", category: "support_ticket", context, status: "open", github_issue: null } as never);
  if (!row) throw bad("We couldn't save that. Please try again in a moment.");
  const body = `New Mila support ticket ${ticketNo}\nFrom: ${name} <${email}> (account ${profile.email})\nTopic: ${LABEL[topic]}\nSubject: ${context.subject}\nPlan: ${context.plan ?? "n/a"} · status ${context.status ?? "n/a"} · credits used ${context.credits_used_this_period ?? "n/a"}\nAttachments: ${files.length ? files.map((f) => f.name).join(", ") : "none"}\n\n${message}\n\nOpen in Mila OS → Support.`;
  try { await sendEmailNotification(process.env.SUPPORT_EMAIL || "hello@milarealestate.app", `[Mila ticket ${ticketNo}] ${context.subject}`, body); } catch (e) { await logError({ source: "api", level: "warn", message: `ticket email failed: ${e instanceof Error ? e.message : e}`, route: "POST /api/support" }); }
  try { const first = name.split(" ")[0] || "there"; await sendEmailNotification(email, `We got your message (${ticketNo})`, `Hi ${first},\n\nWe received your message to Mila support (ticket ${ticketNo}). A person reads every ticket, and replies usually take 48 to 72 hours.\n\nYour message:\n${message}\n\n— The Mila team`, brandedEmail({ preheader: "We got your message. A person will reply within 48 to 72 hours.", chip: `Ticket ${ticketNo}`, heading: `Thanks, ${first}. We've got it.`, body: "A person reads every ticket. Replies usually take 48 to 72 hours, and we'll write to this email address.", quote: { label: "Your message", text: message.slice(0, 600) }, note: "You can reply to this email to add details. Please keep the ticket number in the subject." })); } catch { /* the in-app confirmation is enough */ }
  return { ok: true, ticketNo, message: `Thanks. We got your ticket (${ticketNo}). A person reads every one, and replies usually take 48 to 72 hours. We'll reply to ${email}.` };
});

/** The person's own tickets, newest first. */
export const GET = api(async ({ profile }) => {
  const rows = (await getStore().list("feedback", profile.id)).filter((r) => r.category === "support_ticket").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
  return { tickets: rows.map((r) => { const c = (r.context ?? {}) as { ticket_no?: string; subject?: string; topic_label?: string }; return { id: r.id, ticketNo: c.ticket_no ?? r.id.slice(0, 6), subject: c.subject ?? "Support", topic: c.topic_label ?? "", status: r.status ?? "open", at: r.created_at }; }) };
});
