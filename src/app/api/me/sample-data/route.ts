import { api } from "@/lib/server/route";
import { seedDemoData } from "@/lib/db/seed";
import { isNoDemo } from "@/lib/fresh-accounts";

// Adds clearly fictional sample data to an empty account (onboarding option).
export const POST = api(async ({ profile }) => {
  if (isNoDemo(profile.email)) return { ok: true, skipped: true }; // this account always starts fresh
  await seedDemoData(profile);
  return { ok: true };
});
