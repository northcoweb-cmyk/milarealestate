import { api, HttpError } from "@/lib/server/route";
import { feedToken } from "@/lib/integrations/ics-export";

/** The person's private subscription link (webcal:// opens Apple Calendar straight to "Subscribe"). */
export const GET = api(async ({ profile, url }) => {
  const t = feedToken(profile.id);
  if (!t) throw new HttpError(503, "Calendar link isn't available right now.");
  const host = new URL(process.env.NEXT_PUBLIC_APP_URL || url.origin).host;
  return { https: `https://${host}/api/calendar/feed/${t}.ics`, webcal: `webcal://${host}/api/calendar/feed/${t}.ics` };
});
