import { NextResponse } from "next/server";
import { confirmationEmail, sendMail } from "@/lib/mail";
import { countEntries, dbConfigured, findByEmail, insertEntry, markEmailed } from "@/lib/sb";

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 8;
}
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max) : "");

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "x").split(",")[0].trim();
  if (limited(ip)) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (clean(b.website, 100)) return NextResponse.json({ ok: true }); // honeypot: bots fill this in, people never see it
  const email = clean(b.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const name = clean(b.name, 120) || null;
  const src = clean(b.src, 40).toLowerCase().replace(/[^a-z0-9_.-]/g, "") || null;
  if (!dbConfigured()) { console.error("[join] database not configured"); return NextResponse.json({ error: "Signups are paused for a moment. Please try again soon." }, { status: 503 }); }
  try {
    const existing = await findByEmail(email);
    if (existing) return NextResponse.json({ ok: true, already: true });
    // The first SEAT_CAP signups are the launch group. Anyone after that is queued and gets in when the owner opens more seats.
    const cap = Number(process.env.SEAT_CAP ?? 20), before = await countEntries();
    const queued = Number.isFinite(cap) && before !== null && before >= cap;
    const r = await insertEntry({ email, name, source: src, status: queued ? "queued" : "waiting" });
    if (r.duplicate) return NextResponse.json({ ok: true, already: true });
    let emailed = false;
    try { const m = confirmationEmail(name, queued); emailed = await sendMail(email, m.subject, m.html, m.text); if (emailed && r.id) await markEmailed(r.id); } catch (e) { console.error("[join] email failed", e instanceof Error ? e.message : e); }
    return NextResponse.json({ ok: true, emailed, queued });
  } catch (e) {
    console.error("[join]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
