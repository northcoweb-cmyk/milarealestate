import { api } from "@/lib/server/route";
import { getStore } from "@/lib/db/store";

export const GET = api(async ({ profile }) => {
  const docs = await getStore().list("documents", profile.id);
  // showing sheets and their photos/videos live under the sheet, not in the general documents list
  const visible = docs.filter((d) => !(d.extracted && ((d.extracted as { kind?: string }).kind === "showing_sheet" || (d.extracted as { media?: boolean }).media)));
  return { documents: visible.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(({ text_content, ...d }) => d) };
});
