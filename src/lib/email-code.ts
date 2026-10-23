import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 6-digit email code for new sign-ups: proves the person controls the address (and is not a bot).
 * Stateless: the server hands the browser a signed challenge and emails only the code, so nothing is stored.
 * The code is a keyed hash of the email, a random nonce and the expiry, so it cannot be guessed or reused for another address.
 */
const TTL_MS = 10 * 60_000;
const key = () => {
  const k = process.env.SESSION_SECRET || process.env.INTEGRATION_ENCRYPTION_KEY;
  if (k) return k;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
  return "dev-only-email-code-key";
};
const mac = (label: string, email: string, nonce: string, exp: number) => createHmac("sha256", key()).update(`${label}|${email.trim().toLowerCase()}|${nonce}|${exp}`).digest();
const codeFrom = (email: string, nonce: string, exp: number) => String(mac("code", email, nonce, exp).readUInt32BE(0) % 1_000_000).padStart(6, "0");

/** Required only where it can work: real sign-up (not local dev), mail configured, and not switched off with REQUIRE_EMAIL_CODE=off. */
export const emailCodeRequired = (supabaseMode: boolean) => supabaseMode && !!process.env.RESEND_API_KEY && process.env.REQUIRE_EMAIL_CODE !== "off";

export function makeChallenge(email: string, now = Date.now()): { token: string; code: string } {
  const nonce = randomBytes(12).toString("hex"), exp = now + TTL_MS;
  return { token: `${nonce}.${exp}.${mac("tok", email, nonce, exp).toString("hex")}`, code: codeFrom(email, nonce, exp) };
}

export function checkChallenge(email: string, token: unknown, code: unknown, now = Date.now()): "ok" | "expired" | "bad" {
  if (typeof token !== "string" || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) return "bad";
  const [nonce, expS, sig] = token.split(".");
  const exp = Number(expS);
  if (!nonce || !sig || !Number.isFinite(exp) || !/^[a-f0-9]+$/.test(sig)) return "bad";
  const good = mac("tok", email, nonce, exp), got = Buffer.from(sig, "hex");
  if (got.length !== good.length || !timingSafeEqual(got, good)) return "bad";
  if (now > exp) return "expired";
  const want = Buffer.from(codeFrom(email, nonce, exp)), have = Buffer.from(code.trim());
  return want.length === have.length && timingSafeEqual(want, have) ? "ok" : "bad";
}

export function codeEmail(code: string, name: string) {
  const first = name.trim().split(/\s+/)[0] || "there";
  const subject = `${code} is your Mila code`;
  const text = `Hi ${first},\n\nYour Mila verification code is ${code}. It expires in 10 minutes.\n\nIf you didn't try to create a Mila account, you can ignore this email.\n\nThis is an automated email, so please don't reply.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:28px;color:#14122b"><p style="font-family:Georgia,serif;font-size:30px;margin:0 0 18px">Mila</p><p style="font-size:16px;margin:0 0 14px">Hi ${first.replace(/[<>&"]/g, "")}, here's your verification code:</p><p style="font-size:38px;letter-spacing:.3em;font-weight:700;margin:0 0 6px;background:#f3eeff;border-radius:16px;padding:16px 10px;text-align:center">${code}</p><p style="font-size:14px;color:#6b6890">It expires in 10 minutes. If you didn't try to create a Mila account, ignore this email.</p><p style="font-size:12px;color:#8a87a6">This is an automated email, so please don't reply.</p></div>`;
  return { subject, text, html };
}
