import { isListingImageHost } from "@/lib/media/proxy";
import { api, bad, notFound, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { buildCtx } from "@/lib/agent/engine";
import { ensureCredits, recordUsage } from "@/lib/credits";
import { PLATFORMS, platformLimit } from "@/lib/content/templates";
import { LAYOUTS, PALETTES } from "@/lib/content/design";
import { deletePost, duplicateTo, regenerate, schedulePost, setPostStatus } from "@/lib/content/service";
import type { SocialPlatform, SocialPost, SocialSlide } from "@/lib/types";

const PLAT = PLATFORMS.map((p) => p.key);
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

export const GET = api<{ id: string }>(async ({ profile, params }) => {
  const ctx = await buildCtx(profile);
  const post = await ctx.store.get("social_posts", profile.id, params.id);
  if (!post) throw notFound("That post");
  return { post };
});

/** "/api/media/image?u=<https url>" for a listing photo host we allow (see the image proxy). */
function okProxied(v: string) {
  if (v.length > 900 || !v.startsWith("/api/media/image?u=")) return false;
  try { const t = new URL(decodeURIComponent(v.slice("/api/media/image?u=".length))); return t.protocol === "https:" && isListingImageHost(t.hostname); } catch { return false; }
}

export const PATCH = api<{ id: string }>(async ({ profile, params, req }) => {
  const b = await readJson<Record<string, any>>(req);
  const ctx = await buildCtx(profile);
  let post = await ctx.store.get("social_posts", profile.id, params.id);
  if (!post) throw notFound("That post");

  // plain field edits
  const patch: Partial<SocialPost> = {};
  if ("caption" in b) { const c = str(b.caption, 10_000); if (!c.trim()) throw bad("A post needs some text."); patch.caption = c; }
  if ("hashtags" in b && Array.isArray(b.hashtags)) patch.hashtags = b.hashtags.map((h: unknown) => str(h, 40).replace(/\s+/g, "")).filter((h: string) => /^#?\w+$/.test(h)).map((h: string) => (h.startsWith("#") ? h : "#" + h)).slice(0, 30);
  if ("platform" in b) { if (!PLAT.includes(b.platform)) throw bad("Unknown platform."); patch.platform = b.platform as SocialPlatform; }
  if ("property_id" in b) patch.property_id = b.property_id || null;
  if ("slides" in b && Array.isArray(b.slides)) patch.slides = b.slides.slice(0, 10).map((s: any): SocialSlide => ({ role: ["hero", "highlight", "cta"].includes(s.role) ? s.role : "highlight", headline: str(s.headline, 120), sub: s.sub ? str(s.sub, 160) : undefined, image_id: s.image_id || null, image_url: typeof s.image_url === "string" && (/^\/api\/files\/[\w-]+$/.test(s.image_url) || okProxied(s.image_url)) ? s.image_url : null, theme: PALETTES.some((p) => p.key === s.theme) ? s.theme : undefined, layout: LAYOUTS.some((l) => l.key === s.layout) ? s.layout : undefined })).filter((s: SocialSlide) => s.headline.trim());
  if (Object.keys(patch).length) post = (await ctx.store.update("social_posts", profile.id, post.id, { ...patch, stale: false, stale_reason: null }))!;

  const over = () => post!.caption.length > platformLimit(post!.platform);
  switch (b.action) {
    case undefined: break;
    case "ready": if (over()) throw bad(`That's over ${post.platform}'s ${platformLimit(post.platform).toLocaleString()}-character limit.`); post = await setPostStatus(ctx, post, "ready"); break;
    case "draft": case "posted": case "archive": case "unarchive": post = await setPostStatus(ctx, post, b.action); break;
    case "schedule": {
      if (over()) throw bad(`That's over ${post.platform}'s ${platformLimit(post.platform).toLocaleString()}-character limit.`);
      const r = await schedulePost(ctx, post, String(b.scheduled_for ?? post.scheduled_for ?? ""));
      if (!r.ok) throw bad(r.error);
      post = r.post; break;
    }
    case "regenerate": { rateLimit(`content:${profile.id}`, 20); await ensureCredits(profile.id, 1); post = await regenerate(ctx, post); await recordUsage({ userId: profile.id, operation: "content_regenerate", creditKey: "social_generation" }); break; }
    case "duplicate": {
      const targets = (Array.isArray(b.platforms) ? b.platforms : []).filter((p: string) => PLAT.includes(p as SocialPlatform)) as SocialPlatform[];
      if (!targets.length) throw bad("Choose a platform to copy to.");
      const copies = await duplicateTo(ctx, post, targets);
      return { post, copies };
    }
    default: throw bad("Unknown action.");
  }
  return { post };
});

// Deleting is permanent, so the client must confirm.
export const DELETE = api<{ id: string }>(async ({ profile, params, url }) => {
  if (url.searchParams.get("confirm") !== "1") throw bad("Deleting needs confirmation.");
  const ctx = await buildCtx(profile);
  const post = await ctx.store.get("social_posts", profile.id, params.id);
  if (!post) throw notFound("That post");
  await deletePost(ctx, post);
  return { ok: true };
});
