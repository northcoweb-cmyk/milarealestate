import { type Ctx, } from "../context";
import { createPosts } from "../../content/service";
import { PLATFORMS, platformLimit } from "../../content/templates";
import { buildSignature, withSignature } from "../../signature";
import { parseAddress } from "../nlu";
import { invoke } from "../tools";
import { llmChat } from "../llm";
import { type HandlerOut, reply } from "./types";
import type { Block, SocialPlatform } from "../../types";

interface Theme { key: string; label: string; palette: string; emoji: string; tags: string[]; ideas: string[] }
const THEMES: [RegExp, Theme][] = [
  [/\bhalloween\b|\bspooky\b|\btrick or treat/i, { key: "halloween", label: "Halloween", palette: "halloween", emoji: "🎃", tags: ["#Halloween", "#RealEstateHumor", "#HomeSweetHome"], ideas: ["Boo! 🎃 The only scary part of buying a home is the paperwork. I'll handle that part. 👻", "Plot twist: the only thing haunting your house hunt is a bad floor plan. 🏚️ Message me and let's find one with good bones."] }],
  [/\bthanksgiving\b/i, { key: "thanksgiving", label: "Thanksgiving", palette: "autumn", emoji: "🦃", tags: ["#Thanksgiving", "#Grateful", "#HomeSweetHome"], ideas: ["Grateful for the people who trusted me with one of the biggest moves of their lives. 🍂 Happy Thanksgiving from my home to yours.", "Home is where the table is. 🦃 Wishing you a full house and a full plate this Thanksgiving."] }],
  [/\bchristmas\b|\bholidays?\b|\bhanukkah\b|\bkwanzaa\b|\bseason'?s greetings\b/i, { key: "holiday", label: "the holidays", palette: "festive", emoji: "🎄", tags: ["#HappyHolidays", "#HomeForTheHolidays", "#RealEstate"], ideas: ["Home for the holidays is the best gift. 🎄 Wishing you and yours a warm, bright season.", "To the families I've gotten to help this year: thank you. 🎁 Happy holidays from my home to yours."] }],
  [/\bnew year/i, { key: "newyear", label: "New Year", palette: "winter", emoji: "🥂", tags: ["#NewYear", "#NewBeginnings", "#HomeGoals"], ideas: ["New year, new address? 🥂 If a move is on your list for this year, let's talk about it early.", "Cheers to new beginnings, and maybe new keys. 🔑 Happy New Year!"] }],
  [/\bvalentine/i, { key: "valentines", label: "Valentine's Day", palette: "bloom", emoji: "💘", tags: ["#ValentinesDay", "#LoveWhereYouLive", "#HomeSweetHome"], ideas: ["Love where you live. 💘 Happy Valentine's Day from your favorite real estate agent."] }],
  [/\beaster\b|\bspring\b/i, { key: "spring", label: "spring", palette: "bloom", emoji: "🌷", tags: ["#Spring", "#SpringMarket", "#HomeSweetHome"], ideas: ["Spring is here and so are the open windows. 🌷 Thinking of a move? Let's get a plan in place."] }],
  [/\bsummer\b|\bmemorial day\b|\blabor day\b|\b4th of july\b|\bfourth of july\b|\bindependence day\b/i, { key: "summer", label: "summer", palette: "sunny", emoji: "☀️", tags: ["#Summer", "#HomeSweetHome", "#RealEstate"], ideas: ["Summer's best feature: a backyard. ☀️ Happy long weekend from my home to yours."] }],
  [/\bfall\b|\bautumn\b/i, { key: "fall", label: "fall", palette: "autumn", emoji: "🍂", tags: ["#Fall", "#FallMarket", "#HomeSweetHome"], ideas: ["Fall is a great time to move: fewer crowds, serious buyers, cozy showings. 🍂 Let's talk about your plan."] }],
  [/\bwinter\b|\bsnow\b/i, { key: "winter", label: "winter", palette: "winter", emoji: "❄️", tags: ["#Winter", "#CozyHome", "#RealEstate"], ideas: ["Winter buyers are serious buyers. ❄️ If you're thinking of a move, the season is on your side."] }],
];

export const themeOf = (text: string): Theme | null => THEMES.find(([re]) => re.test(text))?.[1] ?? null;

/** "Write a short, funny Halloween post": a holiday or seasonal post with no home in it. */
export const themedPostAsk = (text: string): boolean => /\b(?:posts?|captions?|stor(?:y|ies)|reel)\b/i.test(text) && !!themeOf(text) && !parseAddress(text) && !/\b(?:just listed|just sold|open house|price (?:drop|reduction)|coming soon|for (?:my )?listing)\b/i.test(text) && !/\b(?:tips?|ideas)\b/i.test(text);

const platformOf = (t: string): SocialPlatform | null => (/\btiktok\b/i.test(t) ? "tiktok" : /\bstory|stories\b/i.test(t) ? "instagram_story" : /\binstagram|\big\b|\binsta\b/i.test(t) ? "instagram" : null);

export async function themedPostHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const theme = themeOf(text)!;
  const platform = platformOf(text);
  if (!platform) {
    const ask = (label: string, suffix: string) => ({ label, style: "secondary" as const, action: { type: "prompt" as const, text: `${text.replace(/[.!?]+$/, "")} for ${suffix}` } });
    return reply(`Fun idea. Where is it going?`, [{ type: "choice", title: `Your ${theme.label} post`, body: "Pick where you'll post it and I'll make it, themed for the day.", buttons: [{ ...ask("Instagram post", "an Instagram post"), style: "primary" }, ask("Instagram story", "an Instagram story"), ask("TikTok", "TikTok")] }], "smalltalk");
  }
  const tone = /\bfunny|humou?r|joke|silly|witty\b/i.test(text) ? "funny and light" : /\bwarm|heartfelt|thank|grateful\b/i.test(text) ? "warm and heartfelt" : "friendly and upbeat";
  const ai = await llmChat(ctx, `Write the caption for a ${tone} ${theme.label} social media post from a real estate agent. 2 to 4 short lines, a hook first, a couple of fitting emojis, and a soft invitation to message me. Do not mention any listing, price, address or event. Do not add hashtags. Return ONLY the caption text.`, [], "").catch(() => null);
  const own = ai?.text?.replace(/^["“”\s]+|["“”\s]+$/g, "").trim();
  const idea = own && own.length > 12 ? own : theme.ideas[Math.abs((ctx.userText ?? text).length) % theme.ideas.length];
  const made = await createPosts(ctx, { category: "local", platforms: [platform], propertyId: null, topic: theme.label });
  if (!made.ok) return reply(made.error, [], "smalltalk");
  const base = made.posts[0];
  const first = idea.split(/\n/)[0].replace(/\s+/g, " ").slice(0, 90);
  const post = (await ctx.store.update("social_posts", ctx.userId, base.id, {
    caption: withSignature(idea, buildSignature(ctx.profile), platformLimit(platform)), hashtags: theme.tags,
    slides: base.slides.slice(0, 1).map((s) => ({ ...s, headline: first, sub: ctx.profile.full_name || "", theme: theme.palette })),
  } as never)) ?? base;
  const pub = await invoke(ctx, "publish_social_post", { postId: post.id });
  if (pub.status === "needs_approval") await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
  const label = PLATFORMS.find((p) => p.key === platform)?.label ?? platform;
  const block: Block = { type: "draft_social", postId: post.id, category: "local", platform, caption: post.caption, slides: post.slides.length ? post.slides : [], status: "Draft", buttons: pub.status === "needs_approval" ? [{ label: "Review", style: "secondary", href: `/tasks?approval=${pub.approval.id}` }, { label: "Approve post", style: "primary", approvalId: pub.approval.id }] : undefined };
  return reply(`${theme.emoji} Here's your ${theme.label} ${label}. Nothing posts until you approve it.`, [block], "social_generation");
}
