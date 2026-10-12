import { NextResponse } from "next/server";
import { getWho, isAuthed } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { brandedEmail } from "@/lib/email-template";
import { table, write } from "@/lib/sb";

type Ctx = { ticket_no?: string; email?: string; name?: string; subject?: string; thread?: { dir: "in" | "out"; at: string; text: string; by?: string }[] };

/** Reply to a support ticket by email, from Mila OS. The reply is saved on the ticket so the whole thread stays in one place. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const who = await getWho();
  if (who !== "ryan") return NextResponse.json({ error: "Only Ryan can reply to tickets." }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; text?: string };
  const id = String(b.id ?? ""), text = String(b.text ?? "").trim().slice(0, 8000);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Missing ticket." }, { status: 400 });
  if (text.length < 2) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
  const rows = await table<{ id: string; context: Ctx | null }>("feedback", { select: "id,context", filter: `id=eq.${id}&category=eq.support_ticket` });
  const t = rows?.[0];
  if (!t?.context?.email) return NextResponse.json({ error: "That ticket has no reply email." }, { status: 404 });
  const c = t.context;
  const first = (c.name ?? "").split(" ")[0] || "there";
  const html = brandedEmail({ preheader: text.slice(0, 90), chip: `Ticket ${c.ticket_no}`, heading: `Hi ${first},`, body: text, note: "Just reply to this email to keep the conversation going. It stays on the same ticket." });
  const sent = await sendMail(c.email!, `Re: [Mila ticket ${c.ticket_no}] ${c.subject ?? "Your message"}`, `Hi ${first},\n\n${text}\n\n— The Mila team\n\n(Reply to this email to continue. Ticket ${c.ticket_no}.)`, html);
  if (!sent.ok) return NextResponse.json({ error: sent.error ?? "The email didn't send." }, { status: 502 });
  const thread = [...(c.thread ?? []), { dir: "out" as const, at: new Date().toISOString(), text, by: who }];
  const saved = await write("feedback", "PATCH", { filter: `id=eq.${id}`, body: { context: { ...c, thread }, status: "replied" } });
  if (!saved) return NextResponse.json({ ok: true, warning: "Sent, but the thread didn't save." });
  return NextResponse.json({ ok: true });
}
