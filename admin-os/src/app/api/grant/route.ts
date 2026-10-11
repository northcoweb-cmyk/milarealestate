import { NextResponse } from "next/server";
import { getWho, isAuthed } from "@/lib/auth";
import { table, write } from "@/lib/sb";

/** An audited credit grant: who, to whom, how many, and why are written into the credit ledger itself. Ryan only. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const who = await getWho();
  if (who !== "ryan") return NextResponse.json({ error: "Only Ryan can grant credits." }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { email?: string; credits?: number; reason?: string };
  const email = String(b.email ?? "").trim().toLowerCase(), credits = Math.round(Number(b.credits)), reason = String(b.reason ?? "").trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Enter the person's email." }, { status: 400 });
  if (!Number.isFinite(credits) || credits < 1 || credits > 5000) return NextResponse.json({ error: "Grant between 1 and 5,000 credits." }, { status: 400 });
  if (reason.length < 3) return NextResponse.json({ error: "Add a short reason (it is saved in the ledger)." }, { status: 400 });
  const prof = await table<{ id: string }>("profiles", { select: "id", filter: `email=eq.${encodeURIComponent(email)}` });
  if (!prof?.length) return NextResponse.json({ error: "No account with that email." }, { status: 404 });
  const tx = await table<{ delta: number }>("credit_transactions", { select: "delta", filter: `user_id=eq.${prof[0].id}` });
  const bal = (tx ?? []).reduce((n, t) => n + t.delta, 0);
  const r = await write("credit_transactions", "POST", { body: { user_id: prof[0].id, kind: "grant", delta: credits, balance_after: bal + credits, reason: `Admin grant by ${who}: ${reason}` } });
  if (!r) return NextResponse.json({ error: "The grant didn't save." }, { status: 502 });
  return NextResponse.json({ ok: true, message: `Granted ${credits} credits to ${email}. New balance ${bal + credits}.` });
}
