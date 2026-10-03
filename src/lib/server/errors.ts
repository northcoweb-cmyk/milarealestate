import { getStore } from "../db/store";
import type { ErrorLog } from "../types";

export const NIL_USER = "00000000-0000-0000-0000-000000000000";
type Input = { source: ErrorLog["source"]; level?: ErrorLog["level"]; message: string; stack?: string | null; route?: string | null; userId?: string | null; email?: string | null; detail?: Record<string, unknown> | null };

const recent = new Map<string, { n: number; at: number }>();
/** Never throws, never blocks the request, and a runaway loop can't flood the table (max 10 identical entries a minute per server). */
export async function logError(i: Input): Promise<void> {
  try {
    const sig = `${i.source}|${i.message.replace(/\d+/g, "#").slice(0, 120)}|${i.userId ?? ""}`;
    const now = Date.now();
    const r = recent.get(sig);
    if (r && now - r.at < 60_000) { if (++r.n > 10) return; } else recent.set(sig, { n: 1, at: now });
    if (recent.size > 500) recent.clear();
    await getStore().insert("error_logs", i.userId ?? NIL_USER, {
      level: i.level ?? "error", source: i.source, message: i.message.slice(0, 500), stack: i.stack ? i.stack.slice(0, 2000) : null,
      route: i.route ? i.route.slice(0, 200) : null, user_email: i.email ?? null, detail: i.detail ?? null, status: "open",
    });
  } catch (e) {
    console.warn("[mila] could not record error", e instanceof Error ? e.message : e);
  }
}

export const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const errStack = (e: unknown) => (e instanceof Error ? e.stack ?? null : null);
