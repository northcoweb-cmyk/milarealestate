// "How was this? Useful / Missing something / Wrong": the ratings are kept quietly (hidden from the Memory screen) and read back into Mila's chat prompt,
// so she answers more like the replies this agent liked and avoids what they said was wrong or missing. Nothing here is ever shown to anyone else.
import type { Message, Memory } from "../types";
import type { Store } from "../db/store";

export const FB_PREFIX = "cache:reply_feedback:"; // "cache:" keeps it out of More → Memory
interface Entry { kind: "useful" | "missing" | "wrong"; q: string; a: string; note: string | null; at: string }
const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Remember a rating on one of Mila's chat replies, with the question that led to it. One entry per reply (the latest rating wins), newest 40 kept. */
export async function recordReplyFeedback(store: Store, userId: string, i: { kind: Entry["kind"]; messageId: string; note: string | null; snippet: string | null }): Promise<void> {
  const msg = await store.get("messages", userId, i.messageId).catch(() => null);
  let q = "";
  if (msg) {
    const all = (await store.list("messages", userId)).filter((m) => m.conversation_id === msg.conversation_id && m.role === "user" && m.created_at <= msg.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
    q = all[0]?.content ?? "";
  }
  const entry: Entry = { kind: i.kind, q: clip(q, 240), a: clip(msg?.content ?? i.snippet ?? "", 300), note: i.note ? clip(i.note, 300) : null, at: new Date().toISOString() };
  if (!entry.q && !entry.a) return;
  const mems = (await store.list("memories", userId)).filter((m) => m.key.startsWith(FB_PREFIX));
  const key = FB_PREFIX + i.messageId;
  const hit = mems.find((m) => m.key === key);
  if (hit) await store.update("memories", userId, hit.id, { value: JSON.stringify(entry) } as never);
  else await store.insert("memories", userId, { scope: "user", subject_id: null, key, value: JSON.stringify(entry), source: "system", confidence: 1, pinned: false } as never);
  const old = mems.filter((m) => m.key !== key).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  for (const m of old.slice(0, Math.max(0, mems.length + (hit ? 0 : 1) - 40))) await store.remove("memories", userId, m.id).catch(() => undefined);
}

/** A short private note for Mila's prompt: what this agent said was wrong or missing, and what they liked. Empty when nothing has been rated. */
export function lessonsFrom(mems: Memory[]): string {
  const list: Entry[] = [];
  for (const m of mems) {
    if (!m.key.startsWith(FB_PREFIX)) continue;
    try { const e = JSON.parse(m.value) as Entry; if (e?.kind) list.push(e); } catch { /* ignore a bad entry */ }
  }
  list.sort((a, b) => b.at.localeCompare(a.at));
  const bad = list.filter((e) => e.kind !== "useful").slice(0, 6), good = list.filter((e) => e.kind === "useful").slice(0, 3);
  if (!bad.length && !good.length) return "";
  const lines: string[] = [];
  for (const e of bad) lines.push(`- ${e.kind === "wrong" ? "They said this was WRONG" : "They said this was MISSING something"}: asked "${e.q}"; you answered "${e.a}"${e.note ? `; their note: "${e.note}"` : ""}. Do better next time on anything similar.`);
  for (const e of good) lines.push(`- They said this was USEFUL (keep that style, length and level of detail): asked "${e.q}"; you answered "${e.a}".`);
  return lines.join("\n");
}

export async function feedbackLessons(store: Store, userId: string): Promise<string> {
  return lessonsFrom(await store.list("memories", userId));
}
