import { api, bad, readJson } from "@/lib/server/route";
import { GOOGLE_SCOPES, testGoogleService, type GoogleService } from "@/lib/integrations/google";

export const POST = api(async ({ profile, req }) => {
  const b = await readJson<{ service?: string }>(req);
  if (!b.service || !(b.service in GOOGLE_SCOPES) || b.service === "base") throw bad("Which connection?");
  return testGoogleService(profile.id, b.service as GoogleService);
});
