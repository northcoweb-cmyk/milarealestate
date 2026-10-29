import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { lapsedList, sendWinback, setHidden, winbackEmail } from "@/lib/lapsed";

export const maxDuration = 60;
const BATCH = 15; // small on purpose: one request must finish well inside the time limit

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; ids?: string[]; subject?: string; body?: string; email?: string; hidden?: boolean; confirm?: string };
  const subject = String(b.subject ?? "").trim().slice(0, 150), body = String(b.body ?? "").trim().slice(0, 5000);
  const ids = Array.isArray(b.ids) ? b.ids.filter((x) => /^[0-9a-f-]{36}$/i.test(String(x))).slice(0, 500) : [];
  try {
    if (b.action === "preview") { const m = winbackEmail(subject || "Subject", body || "Your message", "Sarah", "#"); return NextResponse.json({ html: m.html }); }
    if (b.action === "hide") { const ok = await Promise.all(ids.map((id) => setHidden(id, b.hidden !== false))); return NextResponse.json({ ok: ok.every(Boolean) }); }
    if (!subject || !body) return NextResponse.json({ error: "Write a subject and a message first." }, { status: 400 });
    if (b.action === "test") {
      const email = String(b.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
      const { sendMail } = await import("@/lib/mail");
      const m = winbackEmail(subject, body, "Sarah", "#");
      const r = await sendMail(email, subject.replace(/\{first\}/gi, "Sarah"), m.text, m.html);
      return r.ok ? NextResponse.json({ ok: true, message: `Test sent to ${email}.` }) : NextResponse.json({ error: r.error }, { status: 502 });
    }
    if (b.action === "send") {
      if (b.confirm !== "SEND") return NextResponse.json({ error: "Type SEND to confirm." }, { status: 400 });
      if (!ids.length) return NextResponse.json({ error: "Pick at least one person." }, { status: 400 });
      const { list } = await lapsedList();
      const byId = new Map(list.map((u) => [u.id, u]));
      const take = ids.slice(0, BATCH);
      let sent = 0, skipped = 0; const failed: string[] = [];
      for (const id of take) {
        const u = byId.get(id); // only people who are really lapsed can be emailed from here
        if (!u || u.meta.optout) { skipped++; continue; }
        const r = await sendWinback(u, subject, body);
        if (r.ok) sent++; else failed.push(`${u.email}: ${r.error}`);
      }
      return NextResponse.json({ ok: true, sent, skipped, failed, rest: ids.slice(BATCH), message: `Sent ${sent}${skipped ? `, skipped ${skipped} (unsubscribed)` : ""}.` });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 500 }); }
}
