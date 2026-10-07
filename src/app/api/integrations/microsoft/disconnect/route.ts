import { api } from "@/lib/server/route";
import { disconnectMicrosoft } from "@/lib/integrations/microsoft";

export const POST = api(async ({ profile }) => { await disconnectMicrosoft(profile.id); return { ok: true }; });
