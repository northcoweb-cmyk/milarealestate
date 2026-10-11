/** Merge client-supplied settings over current ones, keeping only known keys with the right type (no arbitrary or oversized data). */
export function mergeKnown<T extends Record<string, any>>(cur: T, inc: unknown): T {
  const out: Record<string, any> = { ...cur };
  if (!inc || typeof inc !== "object" || Array.isArray(inc)) return out as T;
  for (const [k, v] of Object.entries(inc as Record<string, unknown>)) {
    if (!(k in cur)) continue;
    const base = cur[k];
    if (base && typeof base === "object" && !Array.isArray(base)) out[k] = mergeKnown(base, v);
    else if (typeof v === typeof base && (typeof v !== "string" || v.length <= 40)) out[k] = v;
  }
  return out as T;
}

/** Strip control characters (log injection, terminal escapes) and cap length. Newlines become spaces unless keepNewlines. */
export function cleanText(v: unknown, max: number, keepNewlines = false): string {
  const s = String(v ?? "").replace(keepNewlines ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g : /[\u0000-\u001f\u007f\u2028\u2029]+/g, " ");
  return s.trim().slice(0, max);
}

/** Masks things that look like credentials (API keys in URLs, bearer tokens, JWTs, sk-/AIza keys) before text is stored or shown. */
export function redactSecrets(s: string): string {
  return s
    .replace(/([?&](?:key|api_?key|apikey|token|access_token|secret|signature)=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[redacted-jwt]")
    .replace(/\b(?:sk|pk|rk|whsec)_(?:live|test)?_?[A-Za-z0-9]{12,}/g, "[redacted-key]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "[redacted-key]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[redacted-key]");
}

/** For support reports: secrets AND personal contact details (emails, phone numbers) are removed from anything copied out of a chat. */
export function redactPii(s: string): string {
  return redactSecrets(s)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g, "[phone]");
}

export const PROBLEM_CLASSES = ["interpretation_routing", "entity_state", "execution_data_integrity", "factual_grounding", "integration_sync", "approval_status", "ui_accessibility", "performance_cost", "billing", "privacy_security"] as const;
export type ProblemClass = (typeof PROBLEM_CLASSES)[number];
/** First guess at what kind of problem this is, from what the person wrote. Triage can change it. */
export function classifyProblem(note: string, category: string): ProblemClass {
  const t = note.toLowerCase();
  if (/\b(charge|charged|bill|billing|refund|subscription|credit card|payment|credits?)\b/.test(t)) return "billing";
  if (/\b(privacy|someone else'?s|another (?:user|agent)|wrong account|leak|saw (?:a )?(?:stranger|someone))\b/.test(t)) return "privacy_security";
  if (/\b(sync|google calendar|outlook|apple calendar|didn'?t (?:show|appear) (?:up )?in (?:my )?(?:google|calendar))\b/.test(t)) return "integration_sync";
  if (/\b(sent|never sent|approve|approval|says (?:sent|done)|said it (?:sent|was done))\b/.test(t)) return "approval_status";
  if (/\b(slow|laggy|lag|took forever|loading|spinner|timeout)\b/.test(t)) return "performance_cost";
  if (/\b(wrong (?:person|client|house|property|address|time|date)|duplicate|twice|two (?:events|copies)|still (?:there|on my calendar)|deleted|lost)\b/.test(t)) return "execution_data_integrity";
  if (/\b(wrong (?:price|beds|bedrooms|baths|sq ?ft|number|photo|picture)|not the right (?:house|building)|made up|invented)\b/.test(t)) return "factual_grounding";
  if (/\b(picked|chose|mixed up|which (?:one|priya|main)|that one|didn'?t understand|misunderstood|not what i asked|ignored)\b/.test(t)) return category === "wrong_answer" ? "interpretation_routing" : "entity_state";
  if (category === "looks_bad" || /\b(overlap|cut off|clipped|can'?t tap|keyboard|zoom|scroll|screen|button)\b/.test(t)) return "ui_accessibility";
  return category === "broke" ? "execution_data_integrity" : "interpretation_routing";
}
