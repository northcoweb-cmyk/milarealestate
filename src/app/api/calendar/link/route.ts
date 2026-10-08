import { api, bad, readJson } from "@/lib/server/route";
import { FetchBlocked } from "@/lib/images/safe-fetch";
import { fetchIcs, normalizeCalendarLink, removeIcs, saveIcsLink, syncIcs } from "@/lib/integrations/ics";
import { rateLimit } from "@/lib/server/rate-limit";

/** Connect Apple Calendar (or any calendar) by its share link, then pull it in. Read-only; no password involved. */
export const POST = api(async ({ profile, req }) => {
  rateLimit(`calink:${profile.id}`, 12, 60 * 60_000);
  const b = await readJson<{ url?: unknown }>(req);
  const link = typeof b.url === "string" ? normalizeCalendarLink(b.url) : null;
  if (!link) throw bad("Paste the calendar link (it starts with webcal:// or https://).");
  try { await fetchIcs(link); } catch (e) { throw bad(e instanceof FetchBlocked ? e.message : "I couldn't open that calendar link."); }
  await saveIcsLink(profile.id, link);
  const r = await syncIcs(profile.id, profile.timezone);
  return { ok: true, ...r };
});

export const DELETE = api(async ({ profile }) => { await removeIcs(profile.id); return { ok: true }; });
