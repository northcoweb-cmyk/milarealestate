import { createHmac } from "node:crypto";

/** Signs the OAuth `state` nonce to the signed-in user. Never falls back to a guessable key in production. */
export function oauthStateSig(nonce: string, uid: string): string | null {
  const key = process.env.SESSION_SECRET || process.env.INTEGRATION_ENCRYPTION_KEY || (process.env.NODE_ENV === "production" ? "" : "dev");
  if (!key) return null;
  return createHmac("sha256", key).update(`${nonce}.${uid}`).digest("hex");
}
