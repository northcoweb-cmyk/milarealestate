import { api, bad, readJson } from "@/lib/server/route";
import { rateLimit } from "@/lib/server/rate-limit";
import { buildCtx } from "@/lib/agent/engine";
import { aiAvailable } from "@/lib/ai/provider";
import { ensureCredits, recordUsage } from "@/lib/credits";
import { type Category, CATEGORIES, PLATFORMS } from "@/lib/content/templates";
import { createPosts } from "@/lib/content/service";
import type { SocialPlatform } from "@/lib/types";

export const GET = api(async ({ profile, url }) => {
  const ctx = await buildCtx(profile);
  const [posts, props, imgs, docs] = await Promise.all([ctx.store.list("social_posts", profile.id), ctx.store.list("properties", profile.id), ctx.store.list("property_images", profile.id), ctx.store.list("documents", profile.id)]);
  // photos the agent uploaded for posts (not attached to a property), newest first, so any post can reuse them
  const uploads = docs.filter((d) => d.kind === "image" && (d.extracted as { media?: boolean } | null)?.media && !d.property_id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40).map((d) => `/api/files/${d.id}`);
  const photos: Record<string, string[]> = {};
  for (const i of imgs.sort((a, b) => a.position - b.position)) if (i.url.startsWith("/api/files/")) (photos[i.property_id] ??= []).push(i.url);
  const q = url.searchParams.get("q")?.toLowerCase().trim();
  const group = (s: string) => (s === "draft" || s === "pending_approval" || s === "failed" ? "drafts" : s === "approved_unpublished" ? "ready" : s === "scheduled" ? "scheduled" : s === "published" ? "posted" : "archived");
  const counts = { drafts: 0, ready: 0, scheduled: 0, posted: 0, archived: 0 };
  for (const p of posts) counts[group(p.status) as keyof typeof counts]++;
  const status = url.searchParams.get("status"), platform = url.searchParams.get("platform"), property = url.searchParams.get("property");
  const list = posts
    .filter((p) => (!status || group(p.status) === status) && (!platform || p.platform === platform) && (!property || p.property_id === property) && (!q || p.caption.toLowerCase().includes(q)))
    .sort((a, b) => (a.scheduled_for ?? a.created_at).localeCompare(b.scheduled_for ?? b.created_at) * (status === "posted" || status === "archived" ? -1 : 1));
  return { posts: list, photos, uploads, counts, properties: props.map((p) => ({ id: p.id, address: p.address, verified: p.verified })), ai: aiAvailable(), categories: CATEGORIES, platforms: PLATFORMS.map(({ key, label, limit }) => ({ key, label, limit })), tz: profile.timezone };
});

export const POST = api(async ({ profile, req }) => {
  rateLimit(`content:${profile.id}`, 20);
  const b = await readJson<{ category: Category; platforms: SocialPlatform[]; property_id?: string | null; topic?: string | null }>(req);
  const valid = PLATFORMS.map((p) => p.key);
  const platforms = (b.platforms ?? []).filter((p) => valid.includes(p));
  if (!platforms.length) throw bad("Choose at least one platform.");
  if ((b.topic ?? "").length > 400) throw bad("Keep the note under 400 characters.");
  const ctx = await buildCtx(profile);
  await ensureCredits(profile.id, 2);
  const r = await createPosts(ctx, { category: b.category, platforms, propertyId: b.property_id ?? null, topic: b.topic ?? null });
  if (!r.ok) throw bad(r.error);
  await recordUsage({ userId: profile.id, operation: "content_post", creditKey: "social_generation" });
  return { posts: r.posts };
});
