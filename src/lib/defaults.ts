import type { Autonomy, ProfileSettings } from "./types";

/**
 * Initial autonomy: additive, internal, low-consequence actions run on their
 * own; anything that leaves the building (sending, publishing, texting) or
 * changes something that already exists asks first. Users can loosen this in
 * Settings → Autonomy. Deletes and bulk sends ALWAYS ask (see policy.ts).
 */
export const DEFAULT_AUTONOMY: Autonomy = {
  contacts: "auto",
  calendar: "auto",
  calendar_changes: "ask",
  email_drafts: "auto",
  email_sending: "ask",
  tasks: "auto",
  reminders: "auto",
  social_posts: "ask",
  sms: "ask",
};

export function defaultSettings(): ProfileSettings {
  return {
    autonomy: { ...DEFAULT_AUTONOMY },
    notifications: {
      channels: { email: true, browser: true, pwa: true, calendar: true, sms: false },
      topics: { daily_summary: true, task_reminders: true, approval_reminders: true, lead_alerts: true, calendar_conflicts: true, follow_up_reminders: true },
    },
    appearance: { theme: "auto", reduce_motion: false },
    privacy: { store_conversations: true },
  };
}
