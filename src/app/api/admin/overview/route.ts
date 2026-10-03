import { api } from "@/lib/server/route";
import { isAdmin } from "@/lib/auth";
import { buildAdminReport } from "@/lib/admin-report";

export const GET = api(async ({ profile }) => {
  if (!isAdmin(profile)) return Response.json({ error: "Not allowed." }, { status: 403 });
  return await buildAdminReport();
});
