import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/server/bearer";
import { settleReferrals } from "@/lib/referral";

// Daily: release referral rewards whose 14-day hold is over (and void those where the friend cancelled or was refunded). Protect with CRON_SECRET.
export async function GET(req: Request) {
  if (!bearerMatches(req, process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await settleReferrals());
}
