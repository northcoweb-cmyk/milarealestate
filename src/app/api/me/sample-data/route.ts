import { api } from "@/lib/server/route";
import { seedDemoData } from "@/lib/db/seed";
import { authMode } from "@/lib/auth";
import { isNoDemo } from "@/lib/fresh-accounts";

// Adds clearly fictional sample data to an empty account (onboarding option).
export const POST = api(async ({ profile }) => {
  if (authMode() === "supabase") return { ok: true, skipped: true }; // real accounts never get sample data
  if (isNoDemo(profile.email)) return { ok: true, skipped: true }; // this account always starts fresh
  await seedDemoData(profile);
  return { ok: true };
});
