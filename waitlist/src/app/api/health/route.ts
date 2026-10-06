import { NextResponse } from "next/server";
import { mailConfigured } from "@/lib/mail";
import { dbConfigured } from "@/lib/sb";

export const dynamic = "force-dynamic";
/** Shows only whether things are set up, never any values. */
export async function GET() { return NextResponse.json({ ok: dbConfigured(), database: dbConfigured(), email: mailConfigured() }, { headers: { "cache-control": "no-store" } }); }
