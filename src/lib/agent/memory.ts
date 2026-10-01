import type { Contact, Memory, MemoryScope } from "../types";
import type { Ctx } from "./context";
import { fullMoney } from "./context";

/**
 * Durable structured memory. Facts live in the `memories` table (and on the
 * structured contact/property rows); we never rely on chat history to
 * "remember". Users can view, edit and delete everything in More → Memory.
 */
export const CACHE_PREFIX = "cache:";

export async function saveMemory(
  ctx: Ctx,
  m: { scope: MemoryScope; subject_id?: string | null; key: string; value: string; source?: Memory["source"]; confidence?: number; pinned?: boolean },
): Promise<Memory> {
  const all = await ctx.store.list("memories", ctx.userId);
  const hit = all.find((x) => x.scope === m.scope && (x.subject_id ?? null) === (m.subject_id ?? null) && x.key.toLowerCase() === m.key.toLowerCase());
  const data = { value: m.value, source: m.source ?? "user_stated", confidence: m.confidence ?? 1, pinned: m.pinned ?? false };
  if (hit) return (await ctx.store.update("memories", ctx.userId, hit.id, data))!;
  return ctx.store.insert("memories", ctx.userId, { scope: m.scope, subject_id: m.subject_id ?? null, key: m.key, ...data });
}

export async function listMemories(ctx: Ctx, filter?: { scope?: MemoryScope; subject_id?: string }): Promise<Memory[]> {
  const all = await ctx.store.list("memories", ctx.userId);
  return all
    .filter((m) => !m.key.startsWith(CACHE_PREFIX))
    .filter((m) => (!filter?.scope || m.scope === filter.scope) && (!filter?.subject_id || m.subject_id === filter.subject_id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/** Human-readable facts for a contact, merged from structured fields + stored memories. */
export async function contactFacts(ctx: Ctx, c: Contact): Promise<string[]> {
  const f: string[] = [];
  const p = c.preferences;
  if (p.beds_min) f.push(`${p.beds_min}+ bedrooms`);
  if (p.baths_min) f.push(`${p.baths_min}+ bathrooms`);
  for (const x of p.features ?? []) f.push(x);
  if (c.location) f.push(c.location);
  if (c.budget_max) f.push(`${c.budget_min ? fullMoney(c.budget_min) + "–" : "~"}${fullMoney(c.budget_max)}`);
  if (c.timeline) f.push(`Timeline: ${c.timeline}`);
  const mem = await listMemories(ctx, { scope: "contact", subject_id: c.id });
  for (const m of mem) f.push(`${m.key}: ${m.value}`);
  return f;
}
