import { timingSafeEqual, createHash } from "node:crypto";

/** Constant-time check that a request carries `Authorization: Bearer <secret>`. False when the secret isn't configured. */
export function bearerMatches(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const h = createHash("sha256");
  const a = h.update(req.headers.get("authorization") ?? "").digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}
