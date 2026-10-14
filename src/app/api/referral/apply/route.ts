import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { applyCode } from "@/lib/referral";

/** "Were you invited? Enter a code." Only for new accounts that haven't paid and have no referrer yet. */
export const POST = api(async ({ profile, req }) => {
  rateLimit(`refcode:${profile.id}`, 8, 60 * 60_000);
  const b = await readJson<{ code?: unknown }>(req);
  const code = typeof b.code === "string" ? b.code.trim() : "";
  if (!code) throw bad("Enter a code.");
  return applyCode(profile, code);
});
