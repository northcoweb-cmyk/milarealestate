import { api, bad, readJson } from "@/lib/server/route";
import { GOOGLE_SCOPES, disconnectGoogle, disconnectGoogleService, type GoogleService } from "@/lib/integrations/google";

// { service: "calendar" } turns off just that one; with no service it removes the whole Google connection.
export const POST = api(async ({ profile, req }) => {
  const b = await readJson<{ service?: string }>(req).catch(() => ({} as { service?: string }));
  if (b.service) {
    if (!(b.service in GOOGLE_SCOPES) || b.service === "base") throw bad("That service isn't recognised.");
    const r = await disconnectGoogleService(profile.id, b.service as GoogleService);
    return { ok: true, remaining: r.remaining };
  }
  await disconnectGoogle(profile.id);
  return { ok: true, remaining: [] };
});
