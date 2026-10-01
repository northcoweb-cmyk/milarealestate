import { api } from "@/lib/server/route";
import { isAdmin } from "@/lib/auth";
import { marginReport } from "@/lib/credits";

export const GET = api(async ({ profile }) => {
  if (!isAdmin(profile)) return Response.json({ error: "Not allowed." }, { status: 403 });
  return { rows: await marginReport() };
});
