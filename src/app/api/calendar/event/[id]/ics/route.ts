import { api, HttpError } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { eventDescriptionFor } from "@/lib/calendar-details";
import { buildIcs } from "@/lib/integrations/ics-export";

/** One event as a calendar file: tapping it on an iPhone or Mac opens "Add to Calendar" with the right time, place and notes. */
export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const ev = await getStore().get("calendar_events", profile.id, params.id);
  if (!ev) throw new HttpError(404, "I couldn't find that event.");
  const body = buildIcs([{ ev, description: await eventDescriptionFor(profile.id, ev) }]);
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `inline; filename="${ev.title.replace(/[^\w -]+/g, "").trim().slice(0, 40) || "event"}.ics"`, "cache-control": "no-store" } });
});
