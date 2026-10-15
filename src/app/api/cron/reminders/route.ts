import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { bearerMatches } from "@/lib/server/bearer";
import { deliverReminder } from "@/lib/reminders";
import { settleReferrals } from "@/lib/referral";
import { purgeOld } from "@/lib/retention";

// Scheduled (e.g. Vercel Cron) delivery for reminders when the app isn't open. Protect with CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!bearerMatches(req, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const store = getStore();
  const now = new Date().toISOString();
  let delivered = 0, emailed = 0;
  for (const r of (await store.listAll("reminders")).filter((x) => x.status === "pending" && x.remind_at <= now)) {
    const out = await deliverReminder(r);
    delivered++; if (out.emailed) emailed++;
  }
  if (new URL(req.url).searchParams.get("fast") === "1") return NextResponse.json({ delivered, emailed }); // the every-5-minutes run only delivers reminders
  const referrals = await settleReferrals().catch(() => null); // the daily run also releases referral rewards whose hold is over
  const purged = await purgeOld().catch(() => null); // and clears old message traffic to keep storage small
  return NextResponse.json({ delivered, emailed, referrals, purged });
}
