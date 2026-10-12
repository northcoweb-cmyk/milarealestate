import { NextResponse } from "next/server";
import { same } from "@/lib/auth";
import { table, write } from "@/lib/sb";

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
  const subject = String(d.subject ?? d.Subject ?? "");
  let text = String(d.text ?? d.TextBody ?? d.plain ?? "") || String(d.html ?? d.HtmlBody ?? "").replace(/<[^>]+>/g, " ");
  text = text.split(/\r?\n/).filter((l) => !/^>/.test(l)).join("\n").split(/\n\s*On .{5,120} wrote:\s*\n/)[0].replace(/\s+\n/g, "\n").trim().slice(0, 8000);
  const no = /M-[A-Z0-9]{4,8}/.exec(subject)?.[0] ?? /M-[A-Z0-9]{4,8}/.exec(String(d.text ?? d.TextBody ?? ""))?.[0];
  if (!no || !text) return NextResponse.json({ ok: true, ignored: "no ticket number or empty message" });
  const rows = await table<{ id: string; context: Ctx | null }>("feedback", { select: "id,context", filter: `category=eq.support_ticket&context->>ticket_no=eq.${encodeURIComponent(no)}` });
  const t = rows?.[0];
  if (!t) return NextResponse.json({ ok: true, ignored: "unknown ticket" });
  const thread = [...(t.context?.thread ?? []), { dir: "in" as const, at: new Date().toISOString(), text, by: String(d.from ?? d.From ?? "customer").slice(0, 200) }];
  await write("feedback", "PATCH", { filter: `id=eq.${t.id}`, body: { context: { ...(t.context ?? {}), thread }, status: "open" } });
  return NextResponse.json({ ok: true });
}
