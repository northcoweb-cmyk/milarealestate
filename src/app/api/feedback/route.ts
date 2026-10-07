import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { getStore } from "@/lib/db/store";

const KINDS = ["useful", "missing", "wrong"] as const;
const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/** Someone rated something Mila produced. Signed-in only, size-capped and rate-limited. */
export const POST = api(async ({ req, profile }) => {
  rateLimit(`feedback:${profile.id}`, 40, 60 * 60_000);
  const b = await readJson<{ kind?: unknown; target?: unknown; targetId?: unknown; note?: unknown; snippet?: unknown; page?: unknown }>(req);
  const kind = KINDS.find((k) => k === b.kind);
  if (!kind) throw bad("Pick one of the options.");
  const row = await getStore().insert("feedback", profile.id, { kind, target: clip(b.target, 40) ?? "chat", target_id: clip(b.targetId, 80), note: clip(b.note, 1000), snippet: clip(b.snippet, 400), page: clip(b.page, 120) });
  return { ok: true, id: row.id };
});
