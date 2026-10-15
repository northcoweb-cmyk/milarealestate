import { defaultSettings } from "../defaults";
import type { ProfileSettings } from "../types";
import { mergeKnown } from "./sanitize";

/** The known, validated groups of settings (autonomy, notifications, appearance, privacy, workflows), merged over what is saved. Other saved keys (referral, ordering, brand) are kept by the caller. */
export function mergeSettings(cur: ProfileSettings, incoming: unknown): Record<string, any> {
  const d = defaultSettings();
  return mergeKnown({ autonomy: { ...d.autonomy, ...cur.autonomy }, notifications: { channels: { ...d.notifications.channels, ...cur.notifications?.channels }, topics: { ...d.notifications.topics, ...cur.notifications?.topics } }, appearance: { ...d.appearance, ...cur.appearance }, privacy: { ...d.privacy, ...cur.privacy }, workflows: { ...d.workflows!, ...(cur.workflows ?? {}) } } as Record<string, any>, incoming);
}
