import { getStore } from "../db/store";
import type { ErrorLog } from "../types";
import { cleanText, redactSecrets } from "./sanitize";

export const NIL_USER = "00000000-0000-0000-0000-000000000000";
type Input = { source: ErrorLog["source"]; level?: ErrorLog["level"]; message: string; stack?: string | null; route?: string | null; userId?: string | null; email?: string | null; detail?: Record<string, unknown> | null };

const recent = new Map<string, { n: number; at: number }>();
/** Never throws, never blocks the request, and a runaway loop can't flood the table (max 10 identical entries a minute per server). */
export async function logError(i: Input): Promise<void> {
  try {
    // Anything here may be attacker-influenced (client reports, user text): strip control chars so entries can't forge log lines.
    i = { ...i, message: redactSecrets(cleanText(i.message, 500)), route: i.route ? redactSecrets(cleanText(i.route, 200)) : null, stack: i.stack ? redactSecrets(cleanText(i.stack, 2000, true)) : null, email: i.email ? cleanText(i.email, 200) : null };
    if (!i.message) return;
    const sig = `${i.source}|${i.message.replace(/\d+/g, "#").slice(0, 120)}|${i.userId ?? ""}`;
    const now = Date.now();
    const r = recent.get(sig);
    if (r && now - r.at < 60_000) { if (++r.n > 10) return; } else recent.set(sig, { n: 1, at: now });
    if (recent.size > 500) recent.clear();
    await getStore().insert("error_logs", i.userId ?? NIL_USER, {
      level: i.level ?? "error", source: i.source, message: i.message, stack: i.stack ?? null,
      route: i.route ?? null, user_email: i.email ?? null, detail: i.detail ?? null, status: "open",
    });
  } catch (e) {
    console.warn("[mila] could not record error", e instanceof Error ? e.message : e);
  }
}

export const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const errStack = (e: unknown) => (e instanceof Error ? e.stack ?? null : null);
