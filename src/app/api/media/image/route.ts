import { api, bad } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { isListingImageHost } from "@/lib/media/proxy";

export const maxDuration = 30;

/**
 * Same-origin copy of a listing photo, so a post can be drawn onto a canvas and exported (browsers refuse to export a canvas that
 * used a cross-origin image without CORS). Only the photo hosts our providers return are allowed - this is not an open proxy.
 */
export const GET = api(async ({ profile, url }) => {
  rateLimit(`mediaimg:${profile.id}`, 240);
  const u = url.searchParams.get("u") ?? "";
  let target: URL;
  try { target = new URL(u); } catch { throw bad("Bad image link."); }
  if (target.protocol !== "https:" || !isListingImageHost(target.hostname)) throw bad("That image source isn't allowed.");
  const r = await fetch(target, { signal: AbortSignal.timeout(20_000), redirect: "error", headers: { accept: "image/*" } }).catch(() => null);
  const type = r?.headers.get("content-type") ?? "";
  if (!r || !r.ok || !/^image\/(png|jpe?g|webp|gif|avif)\b/i.test(type)) // never SVG/HTML: same-origin script execution
    return new Response(null, { status: 404 });
  const len = Number(r.headers.get("content-length") ?? 0);
  if (len > 8_000_000) return new Response(null, { status: 413 });
  return new Response(r.body, { headers: { "content-type": type, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } });
});
