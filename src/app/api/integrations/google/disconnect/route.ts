import { api } from "@/lib/server/route";
import { disconnectGoogle } from "@/lib/integrations/google";

export const POST = api(async ({ profile }) => { await disconnectGoogle(profile.id); return { ok: true }; });
