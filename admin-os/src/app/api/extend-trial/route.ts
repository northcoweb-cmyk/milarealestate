import { NextResponse } from "next/server";
import { getWho, isAuthed } from "@/lib/auth";
import { table, write } from "@/lib/sb";

/** Extend one person's free trial by a few days. The change is recorded in the credit ledger as a zero-credit audit line. Ryan only. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const who = await getWho();
  if (who !== "ryan") return NextResponse.json({ error: "Only Ryan can extend trials." }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { email?: string; days?: number; reason?: string };
  const email = String(b.email ?? "").trim().toLowerCase(), days = Math.round(Number(b.days)), reason = String(b.reason ?? "").trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Enter the person's email." }, { status: 400 });
  if (!Number.isFinite(days) || days < 1 || days > 14) return NextResponse.json({ error: "Extend by 1 to 14 days." }, { status: 400 });
  if (reason.length < 3) return NextResponse.json({ error: "Add a short reason." }, { status: 400 });
  const prof = await table<{ id: string }>("profiles", { select: "id", filter: `email=eq.${encodeURIComponent(email)}` });
  if (!prof?.length) return NextResponse.json({ error: "No account with that email." }, { status: 404 });
  const sub = await table<{ id: string; period_end: string; status: string }>("subscriptions", { select: "id,period_end,status", filter: `user_id=eq.${prof[0].id}` });
  if (!sub?.length || sub[0].status !== "trial") return NextResponse.json({ error: "That person isn't on a trial." }, { status: 400 });
  const base = Math.max(Date.now(), new Date(sub[0].period_end).getTime());
  const end = new Date(base + days * 86_400_000).toISOString();
  const r = await write("subscriptions", "PATCH", { filter: `id=eq.${sub[0].id}`, body: { period_end: end } });
  if (!r) return NextResponse.json({ error: "The change didn't save." }, { status: 502 });
  const tx = await table<{ delta: number }>("credit_transactions", { select: "delta", filter: `user_id=eq.${prof[0].id}` });
  const bal = (tx ?? []).reduce((n, t) => n + t.delta, 0);
  await write("credit_transactions", "POST", { body: { user_id: prof[0].id, kind: "adjust", delta: 0, balance_after: bal, reason: `Trial extended ${days} days by ${who}: ${reason}` } });
  return NextResponse.json({ ok: true, message: `Trial for ${email} now ends ${end.slice(0, 10)}. No card is ever charged when a trial ends.` });
}
