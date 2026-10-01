import { api } from "@/lib/server/route";
import { seedDemoData } from "@/lib/db/seed";

// Adds clearly fictional sample data to an empty account (onboarding option).
export const POST = api(async ({ profile }) => { await seedDemoData(profile); return { ok: true }; });
