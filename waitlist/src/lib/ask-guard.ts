// Guards for the public "Ask Mila" box. It is open to the whole internet, so every layer here exists to keep it on topic and cheap.

const WINDOW = 10 * 60_000;
const hits = new Map<string, number[]>();
const day = new Map<string, number>();

/** Per-visitor limits: 5 questions per 10 minutes and 25 per day. (In memory: a backstop, the daily cap below is the real ceiling.) */
export function visitorAllowed(ip: string, now = Date.now()) {
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 24 * 3_600_000);
  const recent = list.filter((t) => now - t < WINDOW).length;
  if (recent >= 5 || list.length >= 25) { hits.set(ip, list); return false; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

/** Overall daily cap on model calls, shared across every server instance when the 0007 migration has been run; otherwise per instance. */
export async function dailyCapOk(limit: number, bump: (d: string) => Promise<number | null>, now = new Date()): Promise<boolean> {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const shared = await bump(d).catch(() => null);
  if (typeof shared === "number") return shared <= limit;
  const n = (day.get(d) ?? 0) + 1; day.set(d, n); if (day.size > 5) for (const k of day.keys()) if (k !== d) day.delete(k);
  return n <= Math.min(limit, 100); // fallback is stricter, because it cannot see other instances
}

export function cleanQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return q.length >= 3 && q.length <= 200 ? q : null;
}

// Obvious attempts to hijack the assistant: refused before any model call (free).
const HIJACK = /(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+|previous\s+|prior\s+|above\s+)*(instructions?|rules?|prompts?)|system\s*prompt|developer\s*(message|mode)|jailbreak|\bDAN\b|you\s+are\s+now|pretend\s+(to\s+be|you)|act\s+as\s+(a|an|if)|role\s*-?\s*play|reveal\s+(your|the)\s+(prompt|instructions)|<\/?(system|assistant|user)>|```/i;
export const looksLikeHijack = (q: string) => HIJACK.test(q) || (q.match(/https?:\/\//g)?.length ?? 0) > 1;

/** Plain text only, no links, no stray email addresses, bounded length. */
export function cleanAnswer(raw: string, allowedEmail: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, "").replace(/www\.\S+/gi, "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (m) => (m.toLowerCase() === allowedEmail.toLowerCase() ? m : ""))
    .replace(/[*_#`>~]+/g, "").replace(/\s+/g, " ").trim().slice(0, 600);
}
