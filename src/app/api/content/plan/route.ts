import { rateLimit } from "@/lib/server/rate-limit";
import { api, bad, readJson } from "@/lib/server/route";
import { buildCtx } from "@/lib/agent/engine";
import { ensureCredits, recordUsage } from "@/lib/credits";
import { type Category, CATEGORIES, PLATFORMS } from "@/lib/content/templates";
import { approvePlanned, planContent } from "@/lib/content/service";
import type { SocialPlatform } from "@/lib/types";

export const maxDuration = 60;

// Mila drafts a content calendar (suggested times, max 3/day). Nothing is scheduled until you approve.
export const POST = api(async ({ profile, req }) => {
  rateLimit(`plan:${profile.id}`, 10);
  const b = await readJson<{ postsPerWeek: number; categories: Category[]; platforms: SocialPlatform[]; days?: number; approve?: boolean }>(req);
  const platforms = (b.platforms ?? []).filter((p) => PLATFORMS.some((x) => x.key === p));
  if (!platforms.length) throw bad("Choose at least one platform.");
  const per = Math.round(Number(b.postsPerWeek));
  if (!(per >= 1 && per <= 21)) throw bad("Choose between 1 and 21 posts per week.");
  const cats = (b.categories ?? []).filter((c) => CATEGORIES.some((x) => x.key === c));
  const ctx = await buildCtx(profile);
  await ensureCredits(profile.id, 6);
  const r = await planContent(ctx, { postsPerWeek: per, categories: cats, platforms, days: Math.min(Math.max(Number(b.days) || 14, 7), 28) });
  await recordUsage({ userId: profile.id, operation: "content_plan", creditKey: "content_plan" });
  let approved = null;
  if (b.approve) approved = await approvePlanned(ctx, r.created.map((p) => p.id));
  return { created: r.created.length, skipped: r.skipped, approved };
});
