import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { DESIGNS, announceEmail, daysLeft, type DesignId } from "@/lib/announce";
import { announceCounts, nextAnnounceBatch, sendAnnounce, smtpConfigured } from "@/lib/invites";

export const maxDuration = 60;
const BATCH = 12; // small on purpose: one request must finish well inside the time limit
const ok = (d: string): d is DesignId => DESIGNS.some((x) => x.id === d);

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; design?: string; email?: string; name?: string; confirm?: string };
  const design = String(b.design ?? "countdown");
  if (!ok(design)) return NextResponse.json({ error: "Unknown design." }, { status: 400 });
  try {
    if (b.action === "preview") { const m = announceEmail(design, String(b.name ?? "Sarah").slice(0, 60), daysLeft()); return NextResponse.json({ subject: m.subject, html: m.html }); }
    if (!smtpConfigured()) return NextResponse.json({ error: "Email isn't set up. Add SMTP_HOST, SMTP_USER and SMTP_PASS in this project's Vercel settings, then redeploy." }, { status: 400 });
    if (b.action === "test") {
      const email = String(b.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
      await sendAnnounce(design, { email, name: String(b.name ?? "Sarah").slice(0, 60) }, false);
      return NextResponse.json({ ok: true, message: `Test sent to ${email}.` });
    }
    if (b.action === "send") {
      if (b.confirm !== "SEND") return NextResponse.json({ error: "Type SEND to confirm." }, { status: 400 });
      const batch = await nextAnnounceBatch(BATCH);
      let sent = 0; const failed: string[] = [];
      for (const e of batch) { try { await sendAnnounce(design, e); sent++; } catch (err) { failed.push(`${e.email}: ${err instanceof Error ? err.message : "failed"}`); } }
      const c = await announceCounts();
      return NextResponse.json({ ok: true, sent, failed, remaining: c?.pending ?? 0, message: `Sent ${sent}. ${c?.pending ?? 0} still to send.` });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 500 }); }
}
