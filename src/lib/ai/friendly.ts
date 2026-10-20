/**
 * What a person is allowed to read when a model or data provider fails: a plain sentence. Never the provider's raw JSON, error
 * code, account name or billing link. The raw error stays in the error log for the owner.
 */
export function friendlyAiError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  if (/\b429\b|insufficient_quota|credit_balance|rate.?limit|quota/i.test(raw)) return "Mila's research service is busy or at its limit right now. You weren't charged for this. Please try again in a few minutes.";
  if (/\b(401|403)\b|api key|unauthorized|forbidden/i.test(raw)) return "Mila couldn't reach that service right now. You weren't charged, and the owner has been notified.";
  if (/timeout|timed out|abort|ETIMEDOUT|ECONN|fetch failed|network|\b5\d\d\b/i.test(raw)) return "That took too long or the service didn't answer. You weren't charged. Please try again in a moment.";
  return "I couldn't finish that just now. You weren't charged, and nothing was changed. Please try again in a moment.";
}

/** True when text still carries provider internals (JSON bodies, error codes, billing links) that should never reach a person. */
export function leaksProviderDetail(text: string): boolean {
  return /insufficient_quota|credit_balance_exhausted|platform\.openai\.com|AI provider error|"type"\s*:\s*"[a-z_]+"|\bsk-[A-Za-z0-9]{8,}/i.test(text);
}
