import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { bearerMatches } from "@/lib/server/bearer";
import { sendEmailNotification } from "@/lib/notify";
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
    await store.update("reminders", r.user_id, r.id, { status: "delivered", delivered_at: now });
    await store.insert("notifications", r.user_id, { channel: "pwa", title: r.title, body: "Reminder", status: "sent", related_task_id: null });
    delivered++;
    if (r.channels.includes("email")) {
      const p = await store.get("profiles", r.user_id, r.user_id);
      if (p && p.settings.notifications.channels.email && (await sendEmailNotification(p.email, `Reminder: ${r.title}`, r.title))) emailed++;
    }
  }
  const referrals = await settleReferrals().catch(() => null); // the daily run also releases referral rewards whose hold is over
  const purged = await purgeOld().catch(() => null); // and clears old message traffic to keep storage small
  return NextResponse.json({ delivered, emailed, referrals, purged });
}
