import { NextResponse } from "next/server";
import { getWho, isAuthed } from "@/lib/auth";
import { configured, table } from "@/lib/sb";

const base = () => (process.env.SUPABASE_URL ?? "").trim().replace(/\/(rest|auth|storage)(\/v1.*)?\/*$/i, "").replace(/\/+$/, "");

/** Permanently deletes one account and everything under it (every table cascades from the auth user), which also frees the email to sign up again. Ryan only; the email must be typed back to confirm. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const who = await getWho();
  if (who !== "ryan") return NextResponse.json({ error: "Only Ryan can delete accounts." }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!configured()) return NextResponse.json({ error: "The database isn't connected here." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; email?: string; confirm?: string };
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(String(b.id ?? "")) || !email) return NextResponse.json({ error: "Missing account." }, { status: 400 });
  if (String(b.confirm ?? "").trim().toLowerCase() !== email) return NextResponse.json({ error: "Type the account's email exactly to confirm." }, { status: 400 });
  const prof = await table<{ id: string; email: string }>("profiles", { select: "id,email", filter: `id=eq.${b.id}` });
  if (!prof?.length || prof[0].email.toLowerCase() !== email) return NextResponse.json({ error: "That account wasn't found." }, { status: 404 });
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const r = await fetch(`${base()}/auth/v1/admin/users/${b.id}`, { method: "DELETE", headers: { apikey: svc, Authorization: `Bearer ${svc}` }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r || !(r.ok || r.status === 404)) return NextResponse.json({ error: "The deletion didn't go through. Try again." }, { status: 502 });
  return NextResponse.json({ ok: true, message: `Deleted ${email} and all of their data. The email can sign up again.` });
}
