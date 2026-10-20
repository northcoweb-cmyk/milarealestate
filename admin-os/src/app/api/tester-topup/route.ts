import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { table, write } from "@/lib/sb";

/** The switch for automatic tester top-ups (+3,000 credits whenever a test account runs low). Off = testers run down to zero like real users. */
async function current(): Promise<Record<string, unknown> | null> {
  const rows = await table<{ value: Record<string, unknown> }>("app_config", { select: "value", filter: "key=eq.main" });
  return rows?.[0]?.value ?? null;
}

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const c = await current();
  return NextResponse.json({ on: c?.tester_topup !== false });
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const { on } = (await req.json().catch(() => ({}))) as { on?: boolean };
  const c = await current();
  if (!c) return NextResponse.json({ error: "Open the app's Admin → Plans once to create the settings, then try again." }, { status: 409 });
  const r = await write("app_config", "PATCH", { filter: "key=eq.main", body: { value: { ...c, tester_topup: on !== false }, updated_at: new Date().toISOString() } });
  if (!r) return NextResponse.json({ error: "Couldn't save." }, { status: 502 });
  return NextResponse.json({ ok: true, on: on !== false });
}
