import type { CalendarEvent } from "./types";

/** What the person is told about an event's external copy. "Saved in Mila" is the normal, complete state; a connected calendar adds Synced or Sync needs attention. Never "synced" just because the local save worked. */
export type SyncLabel = { state: "saved" | "synced" | "needs_attention" | "from_external" | "read_only_link"; text: string };

export function syncLabel(e: Pick<CalendarEvent, "source" | "external_id" | "synced_at" | "status">, o: { googleCalendar: boolean }): SyncLabel {
  if (e.source === "google") return { state: "from_external", text: "From Google Calendar" };
  if (e.source === "ics") return { state: "read_only_link", text: "From your calendar link (read-only)" };
  if (e.external_id && e.synced_at) return { state: "synced", text: "Synced to Google Calendar" };
  if (o.googleCalendar) return { state: "needs_attention", text: "Saved in Mila. Google sync needs attention" };
  return { state: "saved", text: "Saved in Mila" };
}
