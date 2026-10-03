import { api, bad, readJson } from "@/lib/server/route";
import { isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db/store";

/** Mark a group of errors resolved / reopen it, or clear resolved ones. */
export const POST = api(async ({ req, profile }) => {
  if (!isAdmin(profile)) return Response.json({ error: "Not allowed." }, { status: 403 });
  const b = await readJson<{ ids?: string[]; status?: "open" | "resolved"; clearResolved?: boolean }>(req);
  const s = getStore();
  if (b.clearResolved) { const all = await s.listAll("error_logs"); let c = 0; for (const l of all.filter((x) => x.status === "resolved")) if (await s.remove("error_logs", l.user_id, l.id)) c++; return { ok: true, cleared: c }; }
  if (!Array.isArray(b.ids) || !b.ids.length || (b.status !== "open" && b.status !== "resolved")) throw bad("Nothing to update.");
  const all = await s.listAll("error_logs");
  const set = new Set(b.ids);
  let n = 0;
  for (const l of all) if (set.has(l.id)) { await s.update("error_logs", l.user_id, l.id, { status: b.status }); n++; }
  return { ok: true, updated: n };
});
