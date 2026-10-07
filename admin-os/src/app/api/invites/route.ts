import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { counts, nextBatch, seatCap, sendInvite, sendTest, smtpConfigured } from "@/lib/invites";

export const maxDuration = 60;
const BATCH = 12; // small on purpose: one request must finish well inside the time limit

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!smtpConfigured()) return NextResponse.json({ error: "Email isn't set up. Add SMTP_HOST, SMTP_USER and SMTP_PASS in this project's Vercel settings, then redeploy." }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; email?: string; confirm?: string };
  try {
    if (b.action === "test") {
      const email = String(b.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
      await sendTest(email);
      return NextResponse.json({ ok: true, message: `Test invite sent to ${email}.` });
    }
    if (b.action === "send") {
      if (b.confirm !== "SEND") return NextResponse.json({ error: 'Type SEND to confirm.' }, { status: 400 });
      const before = await counts();
      const room = Math.max(0, seatCap() - (before?.invited ?? 0));
      if (room === 0) return NextResponse.json({ error: `Seat cap reached (${seatCap()} people let in). Everyone else stays in the queue. Raise SEAT_CAP in this project's Vercel settings when you're ready for more.` }, { status: 400 });
      const batch = await nextBatch(Math.min(BATCH, room));
      let sent = 0; const failed: string[] = [];
      for (const e of batch) { try { await sendInvite(e); sent++; } catch (err) { failed.push(`${e.email}: ${err instanceof Error ? err.message : "failed"}`); } }
      const c = await counts();
      return NextResponse.json({ ok: true, sent, failed, remaining: c?.pending ?? 0, message: `Sent ${sent}. ${c?.pending ?? 0} still waiting.` });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 500 });
  }
}
