import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

export const GET = api(async ({ profile }) => ({ properties: await getStore().list("properties", profile.id) }));
