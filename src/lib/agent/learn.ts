import type { Ctx } from "./context";
import { listMemories, saveMemory } from "./memory";

/**
 * Mila listens to everything the agent says and keeps what is durable: how they work, their market, goals,
 * and what each client wants. Deterministic (no model call), so it is free, instant and never invents facts.
 * Every fact lands in `memories`, visible and editable in More → Memory, and feeds replies and drafts.
 */
const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const clip = (s: string, n = 220) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

const SELF: { key: string; scope: "user" | "business"; re: RegExp; take?: (m: RegExpExecArray) => string }[] = [
  { key: "Market", scope: "business", re: /\b(?:i (?:mostly |mainly )?(?:work|sell|farm|operate|focus) (?:in|on|around)|my (?:market|farm|area|territory) is)\s+([^.!?\n]{3,80})/i },
  { key: "Specialty", scope: "business", re: /\bi (?:specialize|specialise|focus) in\s+([^.!?\n]{3,80})|\bmy (?:niche|specialty|speciality) is\s+([^.!?\n]{3,80})/i },
  { key: "Goal", scope: "business", re: /\b(?:my goal is|i(?:'m| am) (?:trying|aiming|working) (?:to|toward)|i want to (?:close|sell|hit|get|reach|do))\s+([^.!?\n]{3,120})/i },
  { key: "Team", scope: "business", re: /\bi(?:'m| am) (?:on|part of|with) (?:the |a )?([^.!?\n]{3,60}team[^.!?\n]{0,40})|\bmy (?:assistant|partner|team) (?:is|are)\s+([^.!?\n]{3,80})/i },
  { key: "Availability", scope: "user", re: /\b(i (?:don't|do not|never|can't|cannot) (?:work|show|take (?:calls|meetings))[^.!?\n]{2,80}|i(?:'m| am) (?:off|unavailable|out)(?: on| every)?[^.!?\n]{2,60})/i, take: (m) => m[1] },
  { key: "Preference", scope: "user", re: /\bi (?:always|usually|prefer|like to|love to|hate to|never) ([^.!?\n]{4,120})/i, take: (m) => m[0] },
  { key: "Writing style", scope: "user", re: /\b(?:keep (?:my )?(?:emails|texts|messages|captions|posts) ([^.!?\n]{3,80})|(?:i )?(?:sign|end) (?:my )?(?:emails|texts) (?:with|as) ([^.!?\n]{3,60}))/i, take: (m) => m[0] },
];

const CLIENT: { key: string; re: RegExp }[] = [
  { key: "Wants", re: /\b(?:wants?|needs?|is looking for|are looking for|looking for|hoping for|must have|loves?)\b[^.!?\n]{3,140}/i },
  { key: "Budget", re: /\b(?:budget|pre-?approved|approved for|max(?:imum)?|up to)\b[^.!?\n]{0,30}\$?\s?\d[\d,.]*\s?(?:k|m|million)?[^.!?\n]{0,40}/i },
  { key: "Timeline", re: /\b(?:moving|closing|lease (?:ends|is up)|needs? to (?:move|sell|buy)|by (?:the )?(?:end of |next |this )?(?:spring|summer|fall|winter|january|february|march|april|may|june|july|august|september|october|november|december))[^.!?\n]{0,100}/i },
  { key: "Family", re: /\b(?:has|have|with)\b[^.!?\n]{0,30}\b(?:kids?|children|baby|dogs?|cats?|pets?|spouse|husband|wife|partner|parents?|mother|father)\b[^.!?\n]{0,60}/i },
  { key: "Prefers", re: /\bprefers?\b[^.!?\n]{3,100}/i },
  { key: "Concern", re: /\b(?:worried|nervous|concerned|hesitant|afraid|stressed) (?:about|that)\b[^.!?\n]{3,120}/i },
];

/** Returns how many facts were saved. Never throws. */
export async function learnFromTurn(ctx: Ctx, text: string): Promise<number> {
  try {
    if (!text || text.length < 12 || text.length > 1500) return 0;
    let saved = 0;
    const known = await listMemories(ctx);
    const have = (scope: string, subject: string | null, key: string, value: string) =>
      known.some((m) => m.scope === scope && (m.subject_id ?? null) === subject && m.key === key && m.value.toLowerCase() === value.toLowerCase());
    for (const s of sentences(text)) {
      // statements about the agent
      if (/\b(?:i|i'm|i am|my)\b/i.test(s) && !/\?\s*$/.test(s)) {
        for (const r of SELF) {
          const m = r.re.exec(s);
          if (!m) continue;
          const value = clip((r.take ? r.take(m) : (m[1] ?? m[2] ?? m[0])).trim().replace(/[,;:\s]+$/, ""));
          if (value.length < 4 || have(r.scope, null, r.key, value)) continue;
          // preferences/goals accumulate (distinct key per sentence); single-valued facts replace
          const multi = r.key === "Preference" || r.key === "Goal" || r.key === "Availability" || r.key === "Writing style";
          await saveMemory(ctx, { scope: r.scope, key: multi ? `${r.key}: ${clip(value, 40)}` : r.key, value, source: "inferred", confidence: 0.8 });
          saved++;
        }
      }
      // statements about a client we know
      const contacts = await ctx.store.list("contacts", ctx.userId);
      for (const c of contacts) {
        const first = c.name.split(/\s+/)[0];
        if (first.length < 3 || !new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(s) || /\?\s*$/.test(s)) continue;
        for (const r of CLIENT) {
          const m = r.re.exec(s);
          if (!m) continue;
          const value = clip(m[0].trim().replace(/[,;:\s]+$/, ""));
          if (value.length < 6 || have("contact", c.id, r.key, value)) continue;
          await saveMemory(ctx, { scope: "contact", subject_id: c.id, key: r.key, value, source: "inferred", confidence: 0.75 });
          saved++;
        }
      }
    }
    return saved;
  } catch (e) {
    console.warn("[mila] learn skipped", e);
    return 0;
  }
}

/** Everything Mila knows that is relevant to this message, as plain text for the model. */
export async function knowledgeFor(ctx: Ctx, text: string): Promise<string> {
  const all = await listMemories(ctx);
  const lines: string[] = [];
  for (const m of all.filter((x) => x.scope === "user" || x.scope === "business").slice(0, 25)) lines.push(`- ${m.key}: ${m.value}`);
  const contacts = await ctx.store.list("contacts", ctx.userId);
  for (const c of contacts) {
    const first = c.name.split(/\s+/)[0];
    if (first.length < 3 || !new RegExp(`\\b${first}\\b`, "i").test(text)) continue;
    const { contactFacts } = await import("./memory");
    const f = await contactFacts(ctx, c);
    lines.push(`- Client ${c.name}${c.status ? ` (${c.status})` : ""}: ${f.join("; ") || "no details yet"}`);
  }
  return lines.join("\n");
}
