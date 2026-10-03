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
