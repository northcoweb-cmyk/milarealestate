import { api, bad, notFound, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { getStore } from "@/lib/db/store";
import { sendEmailNotification } from "@/lib/notify";

type Msg = { dir: "in" | "out"; at: string; text: string; by?: string };
type Ctx = { ticket_no?: string; subject?: string; topic_label?: string; email?: string; name?: string; thread?: Msg[] };

async function mine(profileId: string, id: string) {
  const row = await getStore().get("feedback", profileId, id);
  return row && row.category === "support_ticket" ? row : null;
}

/** One of the person's own tickets with the whole conversation (their message, our replies, their follow-ups). */
export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const r = await mine(profile.id, params.id);
  if (!r) throw notFound("That ticket");
  const c = (r.context ?? {}) as Ctx;
  return { id: r.id, ticketNo: c.ticket_no, subject: c.subject, status: r.status ?? "open", messages: [{ dir: "in", at: r.created_at, text: r.note ?? "" }, ...(c.thread ?? [])] };
});

/** A follow-up from the person on their own ticket. It reopens the ticket and alerts the owner. */
export const POST = api<{ id: string }>(async ({ profile, params, req }) => {
  rateLimit(`ticketreply:${profile.id}`, 20, 24 * 60 * 60_000);
  const r = await mine(profile.id, params.id);
  if (!r) throw notFound("That ticket");
  const b = await readJson<{ text?: unknown }>(req);
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 5000) : "";
  if (text.length < 2) throw bad("Write a message first.");
  const c = (r.context ?? {}) as Ctx;
  const thread = [...(c.thread ?? []), { dir: "in" as const, at: new Date().toISOString(), text, by: profile.full_name }];
  await getStore().update("feedback", profile.id, r.id, { context: { ...c, thread }, status: "open" } as never);
  try { await sendEmailNotification(process.env.SUPPORT_EMAIL || "hello@milarealestate.app", `[Mila ticket ${c.ticket_no}] Follow-up from ${c.name ?? profile.full_name}`, `${c.name ?? profile.full_name} added to ticket ${c.ticket_no} (${c.subject ?? ""}):\n\n${text}\n\nOpen Mila OS → Inbox → Support to reply.`); } catch { /* it is saved on the ticket either way */ }
  return { ok: true };
});
