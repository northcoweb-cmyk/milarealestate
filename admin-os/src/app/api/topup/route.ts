import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { table, write } from "@/lib/sb";

const TARGET = 3000; // same top-up the app gives test accounts
const DEFAULTS = ["sarahpark0506@gmail.com", "rystillwell06@gmail.com", "northcoweb@yahoo.com"];

/** Brings every tester account up to a full credit balance in one tap (used before launch testing). */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const emails = [...DEFAULTS, ...(process.env.TESTER_EMAILS ?? "").split(",")].map((e) => e.trim().toLowerCase()).filter(Boolean);
  const profiles = await table<{ id: string; email: string }>("profiles", { select: "id,email" });
  if (!profiles) return NextResponse.json({ error: "Couldn't reach the database." }, { status: 502 });
  const mine = profiles.filter((p) => emails.includes(p.email.toLowerCase()));
  const done: string[] = [];
  for (const p of mine) {
    const tx = await table<{ delta: number }>("credit_transactions", { select: "delta", filter: `user_id=eq.${p.id}` });
    const bal = (tx ?? []).reduce((n, t) => n + t.delta, 0);
    if (bal >= TARGET) { done.push(`${p.email} already ${bal}`); continue; }
    const r = await write("credit_transactions", "POST", { body: { user_id: p.id, kind: "grant", delta: TARGET - bal, balance_after: TARGET, reason: "Credit top-up" } });
    done.push(r ? `${p.email} → ${TARGET}` : `${p.email} failed`);
  }
  return NextResponse.json({ ok: true, message: done.length ? done.join("; ") : "No tester accounts found yet." });
}
