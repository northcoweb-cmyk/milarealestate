import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { configured } from "@/lib/sb";
import { buildLive } from "@/lib/live";

export const dynamic = "force-dynamic";
let memo: { at: number; data: Awaited<ReturnType<typeof buildLive>> } | null = null;

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!configured()) return NextResponse.json({ error: "The database isn't connected here." }, { status: 503 });
  if (!memo || Date.now() - memo.at > 3500) memo = { at: Date.now(), data: await buildLive() }; // many screens, one set of queries
  return NextResponse.json(memo.data, { headers: { "cache-control": "no-store" } });
}
