import { api, readJson, bad } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { creditSummary } from "@/lib/credits";
import { isAdmin } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai/provider";
import { googleConfigured } from "@/lib/integrations/google";
import { isValidTz } from "@/lib/time";
import type { Profile, ProfileSettings } from "@/lib/types";

export const GET = api(async ({ profile }) => {
  const credits = await creditSummary(profile.id);
  return { profile, admin: isAdmin(profile), credits: { balance: credits.balance, allowance: credits.allowance, resetsAt: credits.resetsAt }, capabilities: { ai: aiAvailable(), google: googleConfigured() } };
});

const EDITABLE = ["full_name", "role", "brokerage", "location", "primary_market", "timezone", "lat", "lng", "experience", "business_type", "onboarded"] as const;

export const PATCH = api(async ({ profile, req }) => {
  const body = await readJson(req);
  const patch: Partial<Profile> = {};
  for (const k of EDITABLE) if (k in body) (patch as any)[k] = body[k];
  if (patch.timezone && !isValidTz(patch.timezone)) throw bad("Unknown time zone.");
  if (typeof patch.lat === "number") patch.lat = Math.round(patch.lat * 10) / 10; // keep location approximate
  if (typeof patch.lng === "number") patch.lng = Math.round(patch.lng * 10) / 10;
  if (body.settings) {
    const s = body.settings as Partial<ProfileSettings>;
    patch.settings = {
      autonomy: { ...profile.settings.autonomy, ...(s.autonomy ?? {}) },
      notifications: { channels: { ...profile.settings.notifications.channels, ...(s.notifications?.channels ?? {}) }, topics: { ...profile.settings.notifications.topics, ...(s.notifications?.topics ?? {}) } },
      appearance: { ...profile.settings.appearance, ...(s.appearance ?? {}) },
      privacy: { ...profile.settings.privacy, ...(s.privacy ?? {}) },
    };
  }
  const updated = await getStore().update("profiles", profile.id, profile.id, patch);
  return { profile: updated };
});
