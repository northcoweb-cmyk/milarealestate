import { getStore } from "@/lib/db/store";
import { eventDescriptionFor } from "@/lib/calendar-details";
import { buildIcs, feedUser } from "@/lib/integrations/ics-export";
import { clientIp, hit } from "@/lib/server/rate-limit";

/** The live calendar link Apple Calendar subscribes to. Public on purpose (calendar apps can't sign in), so the link itself is the secret: signed to one person, read-only, events only. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!hit(`calfeed:${clientIp(req)}`, 240, 60 * 60_000)) return new Response("Too many requests", { status: 429 });
  const uid = feedUser((await ctx.params).token);
  if (!uid) return new Response("Not found", { status: 404 });
  const store = getStore();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const events = (await store.list("calendar_events", uid)).filter((e) => e.source === "mila" && e.end_at >= since).sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 500);
  const items = await Promise.all(events.map(async (ev) => ({ ev, description: await eventDescriptionFor(uid, ev) })));
  return new Response(buildIcs(items, { name: "Mila", feed: true }), { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300" } });
}
