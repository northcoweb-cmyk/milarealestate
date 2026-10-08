import { api, HttpError } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { icsRow, syncIcs } from "@/lib/integrations/ics";
import { GoogleError, gcal, getGoogle } from "@/lib/integrations/google";

// Pull the next 60 days from Google Calendar into Mila so conflict checks see everything.
export const POST = api(async ({ profile }) => {
  const g = await getGoogle(profile.id);
  const ics = await icsRow(profile.id);
  let fromLink = { added: 0, updated: 0, removed: 0 };
  if (ics) { try { fromLink = await syncIcs(profile.id, profile.timezone); } catch (e) { if (!g?.hasScope("calendar")) return Response.json({ error: e instanceof Error ? e.message : "Couldn't read that calendar link.", code: "link" }, { status: 409 }); } }
  if (!g?.hasScope("calendar")) {
    if (ics) return { added: fromLink.added, updated: fromLink.updated };
    return Response.json({ error: "No calendar is connected yet.", code: "not_connected" }, { status: 409 });
  }
  const store = getStore();
  try {
    const now = new Date();
    const items = await gcal.list(profile.id, now.toISOString(), new Date(now.getTime() + 60 * 86_400_000).toISOString());
    const existing = await store.list("calendar_events", profile.id);
    let added = 0, updated = 0;
    for (const i of items) {
      if (!i.start.dateTime || !i.end.dateTime) continue; // skip all-day for conflict purposes
      const cur = existing.find((e) => e.external_id === i.id);
      const row = { title: i.summary || "Busy", start_at: new Date(i.start.dateTime).toISOString(), end_at: new Date(i.end.dateTime).toISOString(), location: i.location ?? null, status: i.status === "cancelled" ? ("cancelled" as const) : ("confirmed" as const), synced_at: now.toISOString() };
      if (cur) { await store.update("calendar_events", profile.id, cur.id, row); updated++; }
      else { await store.insert("calendar_events", profile.id, { ...row, kind: /showing/i.test(row.title) ? "showing" : /open house/i.test(row.title) ? "open_house" : "other", property_id: null, contact_id: null, source: "google", external_id: i.id, workflow_run_id: null, notes: null }); added++; }
    }
    return { added: added + fromLink.added, updated: updated + fromLink.updated };
  } catch (e) {
    if (e instanceof GoogleError) return Response.json({ error: e.message, code: e.code }, { status: 409 });
    throw new HttpError(502, "Google Calendar didn't respond. Try again in a moment.");
  }
});
