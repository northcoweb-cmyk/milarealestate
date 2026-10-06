import { NextResponse } from "next/server";
import { mailConfigured } from "@/lib/mail";
import { dbConfigured, diagnose } from "@/lib/sb";

export const dynamic = "force-dynamic";
/** Shows only whether things are set up, never any values. */
export async function GET() {
  const db = dbConfigured();
  const d = db ? await diagnose() : null;
  return NextResponse.json({ ok: db && !!d?.table, database: db, table: d?.table ?? false, tableError: d?.tableError ?? null, launchColumns: d?.launchColumns ?? false, email: mailConfigured(), ask: !!process.env.OPENAI_API_KEY && process.env.ASK_DISABLED !== "1" }, { headers: { "cache-control": "no-store" } });
}
