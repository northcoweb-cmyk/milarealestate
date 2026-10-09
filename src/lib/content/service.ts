import { MAX_SOCIAL_POSTS_PER_DAY } from "../config";
import { cachedListingPhotoUrls, getListingMedia } from "../media/service";
import { streetViewPostUrl } from "../media/proxy";
import { aiAvailable } from "../ai/provider";
import { addDays, fmtDay, fmtRange, partsIn, startOfDay, zonedToUtc } from "../time";
import type { Property, SocialPlatform, SocialPost, SocialSlide } from "../types";
import type { Ctx } from "../agent/context";
import { polish, propertyPostData } from "../agent/comms";
import { LAYOUTS, pickLayout, pickTheme } from "./design";
import { pullListingPhotos } from "../images/listing";
import { brandOf, buildSignature, stripSignature, withSignature } from "../signature";
import { type Category, CATEGORIES, PLATFORMS, buildPost, fitToPlatform, platformLimit, variantCount } from "./templates";

/** Content engine: creates, schedules and manages social posts. Nothing here publishes externally. */

export const platformLabel = (p: SocialPlatform) => PLATFORMS.find((x) => x.key === p)?.label ?? p;
const nowIso = () => new Date().toISOString();

/** The agent's own property photos (same-origin URLs only, so they can be exported without tainting the canvas). */
async function imageUrls(ctx: Ctx, propertyId: string | null): Promise<string[]> {
  if (!propertyId) return [];
  const own = (await ctx.store.list("property_images", ctx.userId)).filter((i) => i.property_id === propertyId && i.url.startsWith("/api/files/")).sort((a, b) => a.position - b.position).map((i) => i.url);
  // the agent's own photos first, then the listing photos already found for this home
  const prop = await ctx.store.get("properties", ctx.userId, propertyId);
  const listing = prop?.city && prop.state ? await cachedListingPhotoUrls({ address: prop.address, city: prop.city, state: prop.state, zip: prop.zip, propertyId: prop.id }) : [];
  const all = [...own, ...listing.filter((u) => !own.includes(u))];
  // no photos of their own yet: the Street View photo of the address is the main image, so every listing post has a real picture of the home
  if (!all.length && prop?.city && prop.state && process.env.GOOGLE_MAPS_API_KEY) all.push(streetViewPostUrl(prop.id));
  return all;
}

/** A home with no photos yet gets one real lookup for its listing photos (the plan's photo allowance and the shared budget still apply), so a post never goes out with an empty picture when a listing photo exists. Never throws. */
async function ensureListingPhotos(ctx: Ctx, prop: Property | null): Promise<void> {
  if (!prop?.city || !prop.state) return;
  try {
    const q = { address: prop.address, city: prop.city, state: prop.state, zip: prop.zip, propertyId: prop.id };
    const own = (await ctx.store.list("property_images", ctx.userId)).some((i) => i.property_id === prop.id && i.url.startsWith("/api/files/"));
    if (own || (await cachedListingPhotoUrls(q)).length) return;
    await getListingMedia(ctx.userId, q, { fetch: true });
  } catch { /* photos are optional: the post falls back to Street View or asks for the agent's own */ }
}

/** The agent's own photos across all their properties (for tips, market posts, etc.). */
async function anyPhotoUrls(ctx: Ctx): Promise<string[]> {
  return (await ctx.store.list("property_images", ctx.userId)).filter((i) => i.url.startsWith("/api/files/")).sort((a, b) => a.position - b.position).map((i) => i.url);
}

/** Every slide gets a palette, a layout template and (when the agent has photos) a real photo — rotating so no two posts match. */
function withDesign(slides: SocialSlide[], urls: string[], category: string, seed: number, layout?: string): SocialSlide[] {
  const theme = pickTheme(category, seed);
  const lay = layout ?? pickLayout(urls.length > 0, seed);
  const offset = Math.abs(seed);
  return slides.map((s, i) => ({ ...s, theme, layout: lay, image_url: urls.length ? urls[(offset + (s.role === "hero" ? 0 : i)) % urls.length] : null }));
}

/** Slides built in chat get the same designs as the Content tab: a rotating palette and layout, and the home's real photos (read from its listing link when none are saved yet). */
export async function designSlides(ctx: Ctx, prop: Property, slides: SocialSlide[], category: string, bump = 0, platform?: string): Promise<SocialSlide[]> {
  await ensureListingPhotos(ctx, prop);
  let urls = await imageUrls(ctx, prop.id);
  if (!urls.length && prop.listing_url) { try { await pullListingPhotos(ctx.store, ctx.userId, prop, prop.listing_url); urls = await imageUrls(ctx, prop.id); } catch { /* photos are optional */ } }
  const seed = (await ctx.store.list("social_posts", ctx.userId)).length + bump;
  return withDesign(platform === "instagram_story" ? slides.slice(0, 1) : slides, urls, category, seed); // a story is one image
}

/** The call-to-action line on the last image: a phone number when we have one. */
export const contactLine = (p: Parameters<typeof brandOf>[0] & { full_name: string }) => (brandOf(p).cell ? `Call or text ${brandOf(p).cell}` : null);

export interface CreateInput { category: Category; platforms: SocialPlatform[]; propertyId?: string | null; topic?: string | null; tips?: { n: number; audience: string } | null; client?: string | null; scheduledFor?: string | null; variantSeed?: number }
export type CreateResult = { ok: true; posts: SocialPost[] } | { ok: false; error: string };

async function nextVariant(ctx: Ctx, category: Category): Promise<number> {
  const existing = (await ctx.store.list("social_posts", ctx.userId)).filter((p) => p.category === category).length;
  return existing % variantCount(category);
}

/** The next confirmed open house for a property, as the day + time range a post shows. */
async function openHouseWhen(ctx: Ctx, prop: Property): Promise<{ day: string; range: string } | null> {
  const ev = (await ctx.store.list("calendar_events", ctx.userId)).filter((e) => e.property_id === prop.id && e.kind === "open_house" && e.status === "confirmed" && new Date(e.end_at).getTime() > ctx.now.getTime()).sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
  return ev ? { day: fmtDay(ev.start_at, ctx.tz), range: fmtRange(ev.start_at, ev.end_at, ctx.tz) } : null;
}

export async function createPosts(ctx: Ctx, input: CreateInput): Promise<CreateResult> {
  const def = CATEGORIES.find((c) => c.key === input.category);
  if (!def) return { ok: false, error: "Unknown post type." };
  if (!input.platforms.length) return { ok: false, error: "Choose at least one platform." };
  let prop: Property | null = null;
  if (input.propertyId) prop = await ctx.store.get("properties", ctx.userId, input.propertyId);
  if (def.needsProperty && !prop) return { ok: false, error: `A ${def.label.toLowerCase()} post needs a property.` };

  const when = input.category === "open_house" && prop ? await openHouseWhen(ctx, prop) : null;
  await ensureListingPhotos(ctx, prop);
  let ids = await imageUrls(ctx, prop?.id ?? null);
  // "Pull the images": a listing post with no photos yet reads the listing link's public preview photos.
  if (prop && !ids.length && prop.listing_url) {
    try { await pullListingPhotos(ctx.store, ctx.userId, prop, prop.listing_url); ids = await imageUrls(ctx, prop.id); } catch { /* photos are optional */ }
  }
  const data = prop ? await propertyPostData(ctx, prop, { sold: input.category === "just_sold" }) : null;
  const everyPost = (await ctx.store.list("social_posts", ctx.userId)).length;
  const general = await anyPhotoUrls(ctx);
  const variant = input.variantSeed ?? (await nextVariant(ctx, input.category));
  const out: SocialPost[] = [];
  for (const [pi, platform] of input.platforms.entries()) {
    const seed = everyPost + pi;
    // listing posts use that property's photos; other posts borrow the agent's own listing photos on alternating posts
    const photos = ids; // a post that is not about a home never borrows another home\u2019s photos
    const built = buildPost({
      category: input.category, platform, variant, name: ctx.profile.full_name, role: ctx.profile.role, brokerage: ctx.profile.brokerage,
      market: ctx.profile.primary_market || ctx.profile.location, topic: input.topic, tips: input.tips ?? null, client: input.client ?? null,
      property: prop && data ? { address: prop.address, city: prop.city, state: prop.state, zip: prop.zip, facts: data.stats, details: data.details, descriptors: data.descriptors, fullAddress: data.fullAddress, placeLine: data.placeLine } : null, when, contact: contactLine(ctx.profile),
    });
    let caption = built.caption;
    if (aiAvailable() && platform !== "x") {
      const polished = await polish(ctx, "social", caption);
      caption = fitToPlatform(platform, polished, []).caption; // keeps it inside the platform limit
    }
    caption = withSignature(caption, buildSignature(ctx.profile), platformLimit(platform)); // every public caption ends with who you are
    const post = await ctx.store.insert("social_posts", ctx.userId, {
      platform, caption, hashtags: built.hashtags, slides: withDesign(built.slides, photos, input.category, seed), status: "draft", category: input.category, variant,
      property_id: prop?.id ?? null, event_id: null, workflow_run_id: null, scheduled_for: input.scheduledFor ?? null, stale: false, stale_reason: null, posted_at: null,
    } as never);
    out.push(post);
  }
  return { ok: true, posts: out };
}

// ------------------------------------------------------------------ reminders for scheduled posts
const reminderTitle = (p: SocialPost) => `Post to ${platformLabel(p.platform)}: ${p.caption.split("\n")[0].replace(/[^\p{L}\p{N}\s'!?.,&-]/gu, "").trim().slice(0, 48)}`;

async function cancelReminder(ctx: Ctx, post: SocialPost) {
  if (!post.scheduled_for) return;
  const title = reminderTitle(post);
  for (const r of await ctx.store.list("reminders", ctx.userId)) {
    if (r.status === "pending" && r.title === title && new Date(r.remind_at).getTime() === new Date(post.scheduled_for).getTime()) await ctx.store.update("reminders", ctx.userId, r.id, { status: "cancelled" });
  }
}

export async function schedulePost(ctx: Ctx, post: SocialPost, whenIso: string): Promise<{ ok: true; post: SocialPost } | { ok: false; error: string }> {
  const t = new Date(whenIso);
  if (Number.isNaN(t.getTime())) return { ok: false, error: "Pick a valid date and time." };
  if (t.getTime() < ctx.now.getTime() - 60_000) return { ok: false, error: "That time has already passed." };
  const day = partsIn(t, ctx.tz);
  const same = (await ctx.store.list("social_posts", ctx.userId)).filter((p) => p.id !== post.id && p.scheduled_for && p.status === "scheduled" && (() => { const q = partsIn(new Date(p.scheduled_for!), ctx.tz); return q.y === day.y && q.m === day.m && q.d === day.d; })());
  if (same.length >= MAX_SOCIAL_POSTS_PER_DAY) return { ok: false, error: `You already have ${MAX_SOCIAL_POSTS_PER_DAY} posts that day — that's the daily limit.` };
  await cancelReminder(ctx, post);
  const updated = (await ctx.store.update("social_posts", ctx.userId, post.id, { status: "scheduled", scheduled_for: t.toISOString() }))!;
  const channels = ctx.profile.settings.notifications.channels;
  await ctx.store.insert("reminders", ctx.userId, { title: reminderTitle(updated), remind_at: t.toISOString(), channels: ([channels.pwa && "pwa", channels.browser && "browser", channels.email && "email"].filter(Boolean) as never[]), status: "pending", contact_id: null, event_id: null, workflow_run_id: null, delivered_at: null });
  return { ok: true, post: updated };
}

export async function setPostStatus(ctx: Ctx, post: SocialPost, action: "ready" | "draft" | "posted" | "archive" | "unarchive"): Promise<SocialPost> {
  if (action === "posted" || action === "archive" || action === "draft" || action === "ready") await cancelReminder(ctx, post);
  const patch: Partial<SocialPost> =
    action === "ready" ? { status: "approved_unpublished" } :
    action === "draft" ? { status: "draft" } :
    action === "posted" ? { status: "published", posted_at: nowIso() } :
    action === "archive" ? { status: "archived" } :
    { status: "draft" };
  if (action === "ready" || action === "draft") patch.scheduled_for = null;
  return (await ctx.store.update("social_posts", ctx.userId, post.id, patch))!;
}

export async function deletePost(ctx: Ctx, post: SocialPost) {
  await cancelReminder(ctx, post);
  await ctx.store.remove("social_posts", ctx.userId, post.id);
}

export async function regenerate(ctx: Ctx, post: SocialPost): Promise<SocialPost> {
  const category = (post.category as Category) ?? "buyer_tip";
  const prop = post.property_id ? await ctx.store.get("properties", ctx.userId, post.property_id) : null;
  const variant = ((post.variant ?? 0) + 1) % Math.max(variantCount(category), 2);
  await ensureListingPhotos(ctx, prop);
  const ids = prop ? await imageUrls(ctx, prop.id) : []; // a post that is not about a home never borrows another home's photos
  const curLayout = post.slides[0]?.layout ?? "panel";
  const hasPhoto = ids.length > 0;
  const order = LAYOUTS.filter((l) => hasPhoto || l.photo !== "yes").map((l) => l.key);
  const nextLayout = order[(Math.max(0, order.indexOf(curLayout)) + 1) % order.length];
  const data = prop ? await propertyPostData(ctx, prop, { sold: category === "just_sold" }) : null;
  const when = category === "open_house" && prop ? await openHouseWhen(ctx, prop) : null;
  const built = buildPost({ category, platform: post.platform, variant, contact: contactLine(ctx.profile), name: ctx.profile.full_name, role: ctx.profile.role, brokerage: ctx.profile.brokerage, market: ctx.profile.primary_market || ctx.profile.location, when, property: prop && data ? { address: prop.address, city: prop.city, state: prop.state, zip: prop.zip, facts: data.stats, details: data.details, descriptors: data.descriptors, fullAddress: data.fullAddress, placeLine: data.placeLine } : null });
  // photos the agent picked or uploaded stay on their slides; only empty slides get a fresh pick
  const designed = withDesign(built.slides, ids, post.category ?? "", variant + 1 + (post.slides[0]?.theme ? 1 : 0), nextLayout).map((sl, i) => ({ ...sl, image_url: post.slides[i]?.image_url ?? sl.image_url }));
  return (await ctx.store.update("social_posts", ctx.userId, post.id, { caption: withSignature(built.caption, buildSignature(ctx.profile), platformLimit(post.platform)), hashtags: built.hashtags, slides: designed, variant, stale: false, stale_reason: null }))!;
}

export async function duplicateTo(ctx: Ctx, post: SocialPost, platforms: SocialPlatform[]): Promise<SocialPost[]> {
  const sig = buildSignature(ctx.profile);
  const body = stripSignature(post.caption, sig).replace(/\n\n(#\S+(\s+#\S+)*)\s*$/, "").trim(); // strip the signature and trailing hashtag block
  const out: SocialPost[] = [];
  for (const platform of platforms) {
    if (platform === post.platform) continue;
    const f = fitToPlatform(platform, body, post.hashtags);
    const carousel = PLATFORMS.find((p) => p.key === platform)?.carousel ?? true;
    out.push(await ctx.store.insert("social_posts", ctx.userId, { platform, caption: withSignature(f.caption, sig, platformLimit(platform)), hashtags: f.hashtags, slides: carousel ? post.slides : post.slides.slice(0, 1), status: "draft", category: post.category ?? null, variant: post.variant ?? null, property_id: post.property_id, event_id: post.event_id, workflow_run_id: null, scheduled_for: null, stale: false, stale_reason: null, posted_at: null } as never));
  }
  return out;
}

// --------------------------------------------------------------------------- weekly plan
export interface PlanInput { postsPerWeek: number; categories: Category[]; platforms: SocialPlatform[]; days?: number }

/** Slots at good posting times, spread across days, never more than the daily maximum. */
export function planSlots(now: Date, tz: string, count: number, days: number): Date[] {
  const times: [number, number][] = [[9, 0], [12, 30], [18, 0]];
  const perDay = Math.min(MAX_SOCIAL_POSTS_PER_DAY, Math.max(1, Math.ceil(count / Math.max(1, Math.floor(days * (5 / 7))))));
  const out: Date[] = [];
  for (let d = 0; d < days && out.length < count; d++) {
    const day = partsIn(addDays(startOfDay(now, tz), d, tz), tz);
    if (day.dow === 0 && count / days < 1) continue; // lighter Sundays for low-volume plans
    for (let k = 0; k < perDay && out.length < count; k++) {
      const [h, m] = times[perDay === 1 ? 0 : perDay === 2 ? [0, 2][k] : k];
      const t = zonedToUtc(day.y, day.m, day.d, h, m, tz);
      if (t.getTime() > now.getTime() + 30 * 60_000) out.push(t);
    }
  }
  return out;
}

export async function planContent(ctx: Ctx, input: PlanInput): Promise<{ created: SocialPost[]; skipped: string[] }> {
  const days = input.days ?? 14;
  const total = Math.max(1, Math.min(Math.round((input.postsPerWeek * days) / 7), 3 * days));
  const slots = planSlots(ctx.now, ctx.tz, total, days);
  const props = (await ctx.store.list("properties", ctx.userId)).filter((p) => !p.is_demo || true).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const cats = input.categories.length ? input.categories : (["buyer_tip", "seller_tip", "education", "local", "personal_brand", "market_update"] as Category[]);
  const created: SocialPost[] = [], skipped: string[] = [];
  const used: Record<string, number> = {};
  for (let i = 0; i < slots.length; i++) {
    const cat = cats[i % cats.length];
    const def = CATEGORIES.find((c) => c.key === cat)!;
    let prop: Property | null = null;
    if (def.needsProperty) {
      prop = props[(used[cat] ?? 0) % Math.max(props.length, 1)] ?? null;
      if (!prop) { if (!skipped.includes(def.label)) skipped.push(def.label); continue; }
    }
    used[cat] = (used[cat] ?? 0) + 1;
    const platform = input.platforms[i % input.platforms.length];
    const r = await createPosts(ctx, { category: cat, platforms: [platform], propertyId: prop?.id ?? null, scheduledFor: slots[i].toISOString(), variantSeed: (used[cat] - 1 + created.length) % variantCount(cat) });
    if (r.ok) created.push(...r.posts);
  }
  return { created, skipped };
}

/** Approve every draft that already has a planned time: schedules it and sets its reminder. */
export async function approvePlanned(ctx: Ctx, ids?: string[]): Promise<{ scheduled: number; failed: string[] }> {
  const posts = (await ctx.store.list("social_posts", ctx.userId)).filter((p) => p.status === "draft" && p.scheduled_for && (!ids || ids.includes(p.id)));
  let scheduled = 0; const failed: string[] = [];
  for (const p of posts.sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!))) {
    const r = await schedulePost(ctx, p, p.scheduled_for!);
    if (r.ok) scheduled++; else failed.push(`${platformLabel(p.platform)}: ${r.error}`);
  }
  return { scheduled, failed };
}

export const overLimit = (p: Pick<SocialPost, "platform" | "caption">) => p.caption.length > platformLimit(p.platform);
