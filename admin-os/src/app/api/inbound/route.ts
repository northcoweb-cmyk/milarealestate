import { NextResponse } from "next/server";
import { same } from "@/lib/auth";
import { table, write } from "@/lib/sb";
import { sendMail } from "@/lib/mail";
import { brandedEmail } from "@/lib/email-template";

type Ctx = { ticket_no?: string; thread?: { dir: "in" | "out"; at: string; text: string; by?: string }[] };

/**
 * Customer replies coming back by email. Point an inbound-email service (Resend inbound, Postmark, Cloudflare Email Routing worker, Zapier...) at
 *   https://<mila os>/api/inbound?secret=<INBOUND_SECRET>
 * with JSON containing the sender, the subject (it carries the ticket number like M-AB12CD) and the text. The reply is added to that ticket's thread
 * and the ticket goes back to "open" so it shows up as waiting for you.
 */
export async function POST(req: Request) {
  const secret = process.env.INBOUND_SECRET ?? "";
  const given = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-inbound-secret") ?? "";
  if (secret.length < 16 || !same(given, secret)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const j = (await req.json().catch(() => ({}))) as Record<string, any>;
  const d = (j.data && typeof j.data === "object" ? j.data : j) as Record<string, any>;
  let subject = String(d.subject ?? d.Subject ?? "");
  let rawText = String(d.text ?? d.TextBody ?? d.plain ?? ""), rawHtml = String(d.html ?? d.HtmlBody ?? "");
  // Resend's "email.received" webhook carries only the id; the message body is fetched with the API key.
  if (!rawText && !rawHtml && typeof d.email_id === "string" && process.env.RESEND_API_KEY) {
    try {
      const m = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(d.email_id)}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
      if (m.ok) { const e = (await m.json()) as Record<string, any>; rawText = String(e.text ?? ""); rawHtml = String(e.html ?? ""); subject = subject || String(e.subject ?? ""); }
    } catch { /* ignore: handled as an empty message below */ }
  }
  let text = rawText || rawHtml.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  text = text.split(/\r?\n/).filter((l) => !/^>/.test(l)).join("\n").split(/\n\s*On .{5,120} wrote:\s*\n/)[0].replace(/\s+\n/g, "\n").trim().slice(0, 8000);
  const no = /M-[A-Z0-9]{4,8}/.exec(subject)?.[0] ?? /M-[A-Z0-9]{4,8}/.exec(rawText)?.[0];
  if (!no || !text) return NextResponse.json({ ok: true, ignored: "no ticket number or empty message" });
  const rows = await table<{ id: string; context: Ctx | null }>("feedback", { select: "id,context", filter: `category=eq.support_ticket&context->>ticket_no=eq.${encodeURIComponent(no)}` });
  const t = rows?.[0];
  if (!t) return NextResponse.json({ ok: true, ignored: "unknown ticket" });
  const thread = [...(t.context?.thread ?? []), { dir: "in" as const, at: new Date().toISOString(), text, by: String(d.from ?? d.From ?? "customer").slice(0, 200) }];
  await write("feedback", "PATCH", { filter: `id=eq.${t.id}`, body: { context: { ...(t.context ?? {}), thread }, status: "open" } });
  // a copy to the owner's own inbox, so every reply is seen without opening Mila OS
  const copyTo = (process.env.FORWARD_REPLIES_TO ?? "").trim();
  if (copyTo) {
    const from = String(d.from ?? d.From ?? "the customer");
    const base = (process.env.MILA_OS_URL || "").replace(/\/$/, "");
    await sendMail(copyTo, `[Mila ${no}] New reply from ${from}`, `${from} replied to ticket ${no}:\n\n${text}\n\nReply in Mila OS → Inbox → Support.`, brandedEmail({ preheader: text.slice(0, 90), chip: `Ticket ${no}`, heading: "A customer replied", body: text, quote: { label: "From", text: from }, button: base ? { label: "Reply in Mila OS", href: `${base}/support` } : undefined, note: "Open Mila OS → Inbox → Support to reply from hello@. Replying to this email goes to the customer only if their address is the reply-to." }), from.match(/[^\s<>]+@[^\s<>]+/)?.[0]);
  }
  return NextResponse.json({ ok: true });
}
