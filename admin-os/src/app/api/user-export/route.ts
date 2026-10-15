import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { configured, table } from "@/lib/sb";

export const maxDuration = 60;

// Everything one customer created, as one JSON file, for a "copy of my data" ticket. Built live from the database each time, so it is always current.
// Left out on purpose: sign-in secrets and connection tokens. Uploaded document files are listed here (name, type, size); send the originals separately if they ask.
const TABLES: { name: string; key: string; select: string }[] = [
  { name: "profiles", key: "id", select: "*" },
  { name: "businesses", key: "user_id", select: "*" },
  { name: "contacts", key: "user_id", select: "*" },
  { name: "contact_notes", key: "user_id", select: "*" },
  { name: "contact_events", key: "user_id", select: "*" },
  { name: "properties", key: "user_id", select: "*" },
  { name: "calendar_events", key: "user_id", select: "*" },
  { name: "tasks", key: "user_id", select: "*" },
  { name: "approvals", key: "user_id", select: "*" },
  { name: "documents", key: "user_id", select: "id,name,mime,size_bytes,created_at" },
  { name: "document_templates", key: "user_id", select: "*" },
  { name: "workflow_runs", key: "user_id", select: "*" },
  { name: "memories", key: "user_id", select: "*" },
  { name: "emails", key: "user_id", select: "*" },
  { name: "email_drafts", key: "user_id", select: "*" },
  { name: "social_posts", key: "user_id", select: "*" },
  { name: "reminders", key: "user_id", select: "*" },
  { name: "notifications", key: "user_id", select: "*" },
  { name: "integrations", key: "user_id", select: "provider,status,account_label,scopes,created_at" },
  { name: "subscriptions", key: "user_id", select: "plan_key,status,credits_per_period,period_start,period_end,created_at" },
  { name: "credit_transactions", key: "user_id", select: "*" },
  { name: "conversations", key: "user_id", select: "*" },
  { name: "messages", key: "user_id", select: "*" },
  { name: "feedback", key: "user_id", select: "*" },
];

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!configured()) return NextResponse.json({ error: "The database isn't connected here." }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Missing ticket." }, { status: 400 });
  const t = await table<{ user_id: string; context: { email?: string; ticket_no?: string; topic?: string } | null }>("feedback", { select: "user_id,context", filter: `id=eq.${id}` });
  const ticket = t?.[0];
  if (!ticket || ticket.context?.topic !== "data_copy" || !/^[0-9a-f-]{36}$/i.test(ticket.user_id)) return NextResponse.json({ error: "That isn't a data-copy ticket." }, { status: 400 });
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), ticket: ticket.context?.ticket_no ?? null, account: ticket.context?.email ?? null };
  for (const tb of TABLES) out[tb.name] = (await table(tb.name, { select: tb.select, filter: `${tb.key}=eq.${ticket.user_id}`, max: 50000 })) ?? [];
  const name = `mila-data-${(ticket.context?.ticket_no ?? "ticket").toLowerCase()}.json`;
  return new NextResponse(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
}
