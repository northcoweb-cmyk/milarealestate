import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

export const GET = api(async ({ profile }) => {
  const docs = await getStore().list("documents", profile.id);
  return { documents: docs.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(({ text_content, ...d }) => d) };
});
