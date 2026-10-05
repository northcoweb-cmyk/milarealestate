import { api, readJson, bad } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";
import { creditSummary } from "@/lib/credits";
import { isAdmin } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai/provider";
import { googleConfigured } from "@/lib/integrations/google";
import { mergeKnown } from "@/lib/server/sanitize";
import { defaultSettings } from "@/lib/defaults";
import { isValidTz } from "@/lib/time";
import type { Profile, ProfileSettings } from "@/lib/types";

export const GET = api(async ({ profile }) => {
  const credits = await creditSummary(profile.id);
  return { profile, admin: isAdmin(profile), credits: { balance: credits.balance, allowance: credits.allowance, resetsAt: credits.resetsAt, trial: credits.trial }, capabilities: { ai: aiAvailable(), google: googleConfigured() } };
});

const clip = (v: unknown, n: number) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, n);
async function cleanBrand(b: Partial<NonNullable<ProfileSettings["brand"]>>, userId: string): Promise<NonNullable<ProfileSettings["brand"]>> {
  // The photo must be one of THIS user's own uploaded image files, never an id someone else made up or owns.
  let pfp: string | null = null;
  if (typeof b.pfp === "string" && /^[\w-]{8,64}$/.test(b.pfp)) {
    const doc = await getStore().get("documents", userId, b.pfp);
    if (doc && doc.mime.startsWith("image/")) pfp = doc.id;
  }
  return { credentials: clip(b.credentials, 60), license: clip(b.license, 30), cell: clip(b.cell, 30), office: clip(b.office, 30), email: clip(b.email, 80), team: clip(b.team, 80), pfp };
}

const EDITABLE = ["full_name", "role", "brokerage", "location", "primary_market", "timezone", "lat", "lng", "experience", "business_type", "onboarded"] as const;
const EXPERIENCE = ["new", "growing", "experienced", "team"], BUSINESS = ["buyer", "seller", "rental", "commercial", "investor", "mixed"];

export const PATCH = api(async ({ profile, req }) => {
  const body = await readJson(req);
  const patch: Partial<Profile> = {};
  for (const k of EDITABLE) if (k in body) (patch as any)[k] = body[k];
  for (const [k, n] of [["full_name", 80], ["role", 60], ["brokerage", 80], ["location", 80], ["primary_market", 80]] as const) if (k in patch) {
    if (typeof patch[k] !== "string" && !(k === "brokerage" && patch[k] == null)) throw bad("That value isn't valid.");
    (patch as any)[k] = patch[k] == null ? null : clip(patch[k], n);
  }
  if (patch.full_name !== undefined && !patch.full_name) throw bad("Your name can't be empty.");
  if (patch.experience !== undefined && !EXPERIENCE.includes(patch.experience)) throw bad("Unknown experience level.");
  if (patch.business_type !== undefined && !BUSINESS.includes(patch.business_type)) throw bad("Unknown business type.");
  if ("onboarded" in patch && typeof patch.onboarded !== "boolean") throw bad("That value isn't valid.");
  for (const k of ["lat", "lng"] as const) if (k in patch && patch[k] != null && !(typeof patch[k] === "number" && Number.isFinite(patch[k]) && Math.abs(patch[k]!) <= 180)) throw bad("That location isn't valid.");
  if (patch.timezone && (typeof patch.timezone !== "string" || !isValidTz(patch.timezone))) throw bad("Unknown time zone.");
  if (typeof patch.lat === "number") patch.lat = Math.round(patch.lat * 10) / 10; // keep location approximate
  if (typeof patch.lng === "number") patch.lng = Math.round(patch.lng * 10) / 10;
  if (body.settings) {
    const s = body.settings as Partial<ProfileSettings>;
    const cur = profile.settings;
    const d = defaultSettings();
    const merged = mergeKnown({ autonomy: { ...d.autonomy, ...cur.autonomy }, notifications: { channels: { ...d.notifications.channels, ...cur.notifications?.channels }, topics: { ...d.notifications.topics, ...cur.notifications?.topics } }, appearance: { ...d.appearance, ...cur.appearance }, privacy: { ...d.privacy, ...cur.privacy }, workflows: { ...d.workflows!, ...(cur.workflows ?? {}) } } as Record<string, any>, s);
    for (const v of Object.values(merged.autonomy)) if (v !== "ask" && v !== "auto") throw bad("Unknown autonomy setting.");
    if (!["auto", "day", "night"].includes(merged.appearance.theme)) throw bad("Unknown theme.");
    patch.settings = { ...merged, brand: await cleanBrand({ ...(cur.brand ?? {}), ...((s.brand && typeof s.brand === "object" ? s.brand : {}) as object) }, profile.id) } as ProfileSettings;
  }
  const updated = await getStore().update("profiles", profile.id, profile.id, patch);
  return { profile: updated };
});
