import { parseTipRequest } from "../../content/templates";
import { sharePhotosBlock, wantsPhotos } from "./photos";
import { classifyProperty } from "../../property-kind";
import { fmtDay, fmtRange, fmtShortDate, fmtTime } from "../../time";
import { upcomingWith } from "./lifecycle";
import type { Block, CalendarEvent, Contact, EmailDraft, Property, SocialPost, SocialSlide } from "../../types";
import { type Ctx, firstName, fullMoney } from "../context";
import { openHouseSocial, signature, verifiedFacts } from "../comms";
import { createPosts, designSlides } from "../../content/service";
import { llmDraftEmail } from "../llm";
import { contactFacts } from "../memory";
import { capitalisedNames, parseAddress, parseDate, parseTime } from "../nlu";
import { TOOLS, invoke, logContactEvent } from "../tools";
import { upcomingEvents } from "./calendar";
import { type HandlerOut, reply } from "./types";
import { askBack } from "./ask";
import { type Spec, atWord, bodyOf, channelOf, contentOf, purposeOf, subjectOf } from "../compose";
import { finishEmailBody } from "../../signature";
import { persistState } from "../conversation";
import { resolveProperty } from "./listing";
import { enrichProperty, resolveAddress } from "../property-lookup";
import { extractListingFacts, hasAnyFact } from "../listing";
import { ambiguousFirstName, askWhichPerson } from "./entity";
import { mentionedContacts } from "./contacts";
import { firstNameOf } from "../../names";
import { STAGE_KEY, buildCard } from "../../property-stage";

const COUNT_WORDS: Record<string, number> = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
/** "make me 3 posts", "three captions", "a post" → how many the agent asked for (1-6). */
function requestedCount(text: string): number {
  const m = /\b(\d+|one|two|three|four|five|six|an?)\s+(?:[a-z]+\s+){0,2}?(?:posts?|captions?|carousels?|stories|story)\b/i.exec(text);
  if (!m) return 1;
  const n = COUNT_WORDS[m[1].toLowerCase()] ?? +m[1];
  return Math.max(1, Math.min(6, n || 1));
}

/** Different angles for the same listing. Only verified facts are ever stated; nothing is invented. */
function postAngles(prop: Property, facts: string[], images: string[], ctx: Ctx): { name: string; caption: string; slides: SocialSlide[] }[] {
  const icon = ((g) => (g === "commercial" ? "🏢" : g === "land" ? "🌳" : "🏡"))(classifyProperty({ address: prop.address, beds: prop.beds, baths: prop.baths, description: prop.description }).group);
  const where = prop.address + (prop.city ? `, ${prop.city}` : "");
  const line = facts.join(" • ");
  const hero = (sub: string): SocialSlide => ({ role: "hero", headline: prop.address, sub, image_id: images[0] ?? null });
  const cta: SocialSlide = { role: "cta", headline: "Let's talk", sub: ctx.profile.full_name, image_id: null };
  const hi = (headline: string, i = 1): SocialSlide => ({ role: "highlight", headline, image_id: images[i] ?? images[0] ?? null });
  return [
    { name: "Just Listed", caption: [`Just Listed! ${icon}`, "", where, line, "", "Message me for details or a private showing."].join("\n"), slides: [hero("Just Listed"), hi(line || "See it in person"), cta] },
    { name: "Inside look", caption: [`Step inside ${prop.address}. 👀`, line ? `\n${line}` : "", "", "Swipe through, then tell me what you think."].join("\n"), slides: [hero("Take a look inside"), hi(line || "Come see it in person", 2), cta] },
    { name: "Private showing", caption: [`Want to see ${prop.address} in person?`, "", "Private showings are open — send me a message and we'll find a time that works for you. 🔑"].join("\n"), slides: [hero("Private showings"), hi(line || "See it in person", 2), cta] },
    { name: "Offered at", caption: [prop.list_price && prop.verified ? `Offered at ${fullMoney(prop.list_price)} ${icon}` : `Your next home could be ${prop.address} ${icon}`, "", where, line && !prop.list_price ? line : facts.filter((f) => !/^Offered/.test(f)).join(" • "), "", "DM me for the full details."].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n"), slides: [hero(prop.list_price && prop.verified ? `Offered at ${fullMoney(prop.list_price)}` : "Now available"), hi(line || "Details on request", 2), cta] },
    { name: "Save it", caption: [`Save this one for later. 🔖`, "", where, "", "Know someone looking in the area? Send them my way."].join("\n"), slides: [hero("Save for later"), hi("Know someone looking in the area?", 1), cta] },
    { name: "Ask me", caption: [`Questions about ${prop.address}?`, "", "I'm happy to walk you through it — message me anytime. 💬"].join("\n"), slides: [hero("Ask me anything"), hi("I will walk you through it", 1), cta] },
  ];
}

/** Where a home really is (manual stage first, else worked out from its offer, events and closing), so no post advertises a home that is under contract or sold. */
async function stageOfProperty(ctx: Ctx, prop: Property): Promise<string | undefined> {
  const mems = await ctx.store.list("memories", ctx.userId);
  const manual = mems.find((m) => m.scope === "property" && m.subject_id === prop.id && m.key === STAGE_KEY)?.value;
  if (manual) return manual;
  try { const evs = await ctx.store.list("calendar_events", ctx.userId); return buildCard(prop, mems, evs, [], ctx.now).stage; } catch { return undefined; }
}

export async function socialPostHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const platform = /\btik ?tok\b/i.test(text) ? "tiktok" : /\bstor(y|ies)\b/i.test(text) ? "instagram_story" : "instagram"; // Instagram feed posts and stories are what Mila makes
  const addr = parseAddress(text);
  // "a home-anniversary post for the Ferreiras": a thank-you to past clients, by first names, never a listing post
  if (/\banniversar\w*\b/i.test(text) && !addr) {
    const all = await ctx.store.list("contacts", ctx.userId);
    const fam = /\bthe\s+([\p{Lu}][\p{L}'’-]+?)s?\b/u.exec(text)?.[1]?.toLowerCase();
    const hits = (await mentionedContacts(ctx, text)).concat(fam ? all.filter((c) => c.name.toLowerCase().split(/\s+/).pop() === fam || c.name.toLowerCase().split(/\s+/).pop() === `${fam}s`) : []);
    const firsts = [...new Set(hits.map((c) => (/\s(?:&|and)\s/i.test(c.name) ? c.name.replace(/^QA TEST\s+/i, "").split(/\s+/).slice(0, -1).join(" ").replace(/\s+and\s+/i, " & ") : firstNameOf(c.name))))].slice(0, 3);
    const client = firsts.length ? firsts.join(" & ") : (/\bfor\s+(?:the\s+)?([\p{Lu}][\p{L}'’-]+)/u.exec(text)?.[1] ?? null);
    const prior = (await ctx.store.list("social_posts", ctx.userId)).find((p) => p.category === "anniversary" && ["draft", "pending_approval", "ready"].includes(p.status) && client && p.caption.includes(client) && Date.now() - new Date(p.created_at).getTime() < 7 * 86_400_000);
    if (prior) return reply(`You already have a home-anniversary post for ${client} waiting. I didn't make a second one.`, [{ type: "choice", title: "What next?", buttons: [{ label: "Open it", style: "primary", href: `/content?post=${prior.id}` }] }], "smalltalk");
    const made = await createPosts(ctx, { category: "anniversary", platforms: [platform], topic: null, client });
    if (made.ok) {
      const bl: Block[] = [];
      for (const post of made.posts) {
        const pub = await invoke(ctx, "publish_social_post", { postId: post.id });
        if (pub.status === "needs_approval") await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
        bl.push({ type: "draft_social", postId: post.id, category: post.category ?? undefined, platform, caption: post.caption, slides: post.slides, status: "Draft", buttons: pub.status === "needs_approval" ? [{ label: "Review", style: "secondary", href: `/tasks?approval=${pub.approval.id}` }] : undefined });
      }
      return reply(`Here's a home-anniversary post${client ? ` for ${client} (first names only)` : ""}. It's a thank-you, not a listing. Nothing posts until you approve it.`, bl, "social_generation");
    }
  }
  // not about a property at all: tips, advice, how-it-works, "congrats to the Nguyens". Never reuse whatever listing came up last.
  if (!addr && !/\b(it|that|this|that one|this one|the showing|the listing|the property|the house|the home|open house)\b/i.test(text)) {
    const tip = /\b(tips?|advice|first[- ]time|how (?:it )?works|myths?|explain|educat\w*|what to know|things to know|guide)\b/i.test(text);
    const sold = /\b(sold|congrat\w*|closed|closing)\b/i.test(text);
    if (tip && !sold) {
      const category = /\b(sell(?:er|ers|ing)?|list(?:ing)? your|home ?owners?)\b/i.test(text) ? "seller_tip" : /\b(buy(?:er|ers|ing)?|first[- ]time|purchase)\b/i.test(text) ? "buyer_tip" : "education";
      const tn = /\b(\d{1,2})\s+(?:quick |simple |easy |top |great )?tips?\b/i.exec(text);
      const aud = /\btips?\s+(?:for|to help)\s+(.+?)[.?!]*$/i.exec(text)?.[1]?.trim() || (category === "seller_tip" ? "home sellers" : category === "buyer_tip" ? "home buyers" : "everyone");
      const parsedTips = parseTipRequest(text);
      const made2 = await createPosts(ctx, { category, platforms: [platform], topic: parsedTips ? text : null, tips: parsedTips ? undefined : tn ? { n: Math.min(8, Math.max(2, Number(tn[1]))), audience: aud } : null });
      if (made2.ok) {
        const blocks2: Block[] = [];
        for (const post of made2.posts) {
          const pub = await invoke(ctx, "publish_social_post", { postId: post.id });
          if (pub.status === "needs_approval") await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
          blocks2.push({ type: "draft_social", postId: post.id, category: post.category ?? undefined, platform, caption: post.caption, slides: post.slides, status: "Draft", buttons: pub.status === "needs_approval" ? [{ label: "Review", style: "secondary", href: `/tasks?approval=${pub.approval.id}` }, { label: "Approve post", style: "primary", approvalId: pub.approval.id }] : undefined });
        }
        return reply(`Here's ${/^[aeiou]/i.test(platform) ? "an" : "a"} ${platform === "instagram_story" ? "Instagram story" : "Instagram carousel"} with ${category === "seller_tip" ? "seller" : category === "buyer_tip" ? "buyer" : "real estate"} tips. Nothing posts until you approve it.`, blocks2, "social_generation");
      }
    }
    if (sold) return askBack(ctx, "social_post", text, "address", "Which home closed? Give me the address and I'll build the sold post.");
  }
  const events = await upcomingEvents(ctx);
  // "make a post for it" means the property we were just talking about (the showing just added, the last listing), never some other open house
  const refersBack = !addr && (/\b(it|that|this|that one|this one|the showing|the listing|the property|the house|the home)\b/i.test(text) || (!!ctx.state.last_property_id && !/\b(next|upcoming|tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday|my open house)\b/i.test(text))); // no address said: the home we were just on, not some other open house
  let prop: Property | null = refersBack ? null : await resolveProperty(ctx, text, false);
  if (refersBack && ctx.state.last_property_id) prop = await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id);
  if (refersBack && !prop) {
    const lastEv = ctx.state.last_event_id ? await ctx.store.get("calendar_events", ctx.userId, ctx.state.last_event_id) : null;
    if (lastEv?.property_id) prop = await ctx.store.get("properties", ctx.userId, lastEv.property_id);
    if (!prop && lastEv) {
      const street = parseAddress(`${lastEv.location ?? ""} ${lastEv.title}`);
      if (street) {
        const props = await ctx.store.list("properties", ctx.userId);
        prop = props.find((x) => x.address.toLowerCase() === street.toLowerCase()) ?? (((await TOOLS.create_property.run(ctx, { address: street, city: null, state: null, zip: null, county: null, list_price: null, beds: null, baths: null, sqft: null })) as any).data?.property as Property | undefined) ?? null;
      }
    }
    if (!prop && ctx.state.last_property_id) prop = await ctx.store.get("properties", ctx.userId, ctx.state.last_property_id);
  }
  let ev: CalendarEvent | undefined = refersBack && !prop ? undefined : events.find((e) => e.kind === "open_house" && (prop ? e.property_id === prop.id : !addr || `${e.title} ${e.location}`.toLowerCase().includes(addr.toLowerCase())));
  if (!prop && ev?.property_id) prop = await ctx.store.get("properties", ctx.userId, ev.property_id);
  if (!prop) prop = await resolveProperty(ctx, text, true);
  // an address she just gave that isn't saved yet: save it (city and state if said) and carry on, never ask for the address she already typed
  if (!prop && addr) {
    const r = await resolveAddress(ctx, text, addr, { answering: false }).catch(() => null);
    const loc = r && r.status === "ok" ? r.place : null;
    const made = (await TOOLS.create_property.run(ctx, { address: addr, city: loc?.city ?? null, state: loc?.state ?? null, zip: loc?.zip ?? null, county: null, list_price: null, beds: null, baths: null, sqft: null })) as any;
    prop = (made?.data?.property as Property | undefined) ?? null;
  }
  if (!prop) return reply("Which property is the post for? Give me an address and I'll build it.");
  ctx.state.last_property_id = prop.id;
  // facts the agent states in the request itself ("…for 12 Oak Lane, 3 bed 2 bath, $525,000") are authoritative: keep them on the home, so the post uses them and the next one does too
  const stated = extractListingFacts(text);
  if (hasAnyFact(stated)) {
    const patch: Record<string, unknown> = {};
    // "price reduction … new price $599k" is a draft's wording, never a change to the saved home: the post shows the new price, the record keeps the real one until the agent changes it
    const priceTalk = /\b(?:price (?:reduction|drop|cut|improvement|change)|reduc\w*|new price|lower\w* the price|drop\w* the price)\b/i.test(text);
    for (const k of ["list_price", "beds", "baths", "sqft"] as const) if (stated[k] != null && stated[k] !== prop[k] && !(k === "list_price" && priceTalk)) patch[k] = stated[k];
    if (Object.keys(patch).length) prop = (await ctx.store.update("properties", ctx.userId, prop.id, { ...patch, verified: true } as never)) ?? prop;
    if (priceTalk && stated.list_price != null) prop = { ...prop, list_price: stated.list_price };
  }
  // a post is only as good as its facts: when the home has no beds, baths, size or price yet, look them up once (cached) instead of posting an address alone
  if (prop.beds == null && prop.baths == null && !prop.sqft && !prop.list_price && prop.city && prop.state && !/\b(commercial|land|lot|retail|office)\b/i.test(`${prop.description ?? ""}`)) {
    try { ctx.steps.push("Looking up the home's details"); prop = (await enrichProperty(ctx, prop, {})).property; } catch { /* the post still goes ahead */ }
  }
  const images = (await ctx.store.list("property_images", ctx.userId)).filter((i) => i.property_id === prop!.id).sort((a, b) => a.position - b.position).map((i) => i.id);
  // "congrats to the Nguyens" / "sold caption" for a home: a Just Sold post, not a listing announcement
  if (/\b(sold|congrat\w*|just closed|closed on)\b/i.test(text) && !/open\s*house/i.test(text)) {
    const nm = /(?:congrat\w*|sold|thank\w*)\s+(?:to|for)?\s*(the\s+)?([A-Z][\p{L}'’-]+(?:\s*(?:&|and)\s*[A-Z][\p{L}'’-]+)?(?:\s+[A-Z][\p{L}'’-]+)?)/u.exec(text);
    const cleanName = nm ? nm[2].split(/\s+/).filter((w, k, a) => !(k > 0 && /^(It|It's|This|That|They|We|I|And|For|On|At|In|Was|Is|Just|Sold|Write|Make)$/.test(w) && a.slice(0, k).length >= 1) || /^(&|and)$/i.test(a[k - 1] ?? "")).join(" ") : "";
    const client = nm && cleanName && !/^(Sold|Just|The|It|This|That|Mila|Instagram|Caption|Post)$/i.test(cleanName) ? `${nm[1] ? "The " : ""}${cleanName.replace(/\s+and\s+/i, " & ")}` : null;
    const soldPosts = await createPosts(ctx, { category: "just_sold", platforms: [platform], propertyId: prop.id, topic: null, client });
    if (soldPosts.ok) {
      const soldBlocks: Block[] = [];
      for (const post of soldPosts.posts) {
        const pub = await invoke(ctx, "publish_social_post", { postId: post.id });
        if (pub.status === "needs_approval") await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
        soldBlocks.push({ type: "draft_social", postId: post.id, category: post.category ?? undefined, platform, caption: post.caption, slides: post.slides, status: "Draft", buttons: pub.status === "needs_approval" ? [{ label: "Review", style: "secondary", href: `/tasks?approval=${pub.approval.id}` }, { label: "Approve post", style: "primary", approvalId: pub.approval.id }] : undefined });
      }
      return reply(`Here's a Just Sold post for ${prop.address}. Nothing posts until you approve it.`, soldBlocks, "social_generation");
    }
  }
  // "Coming Soon" is its own post: no "Just Listed", no price, no "offered at" for a home that is not on the market yet
  if (/\bcoming soon\b/i.test(text) && !/open\s*house/i.test(text)) {
    const made = await createPosts(ctx, { category: "coming_soon", platforms: [platform], propertyId: prop.id, topic: null });
    if (made.ok) {
      const bl: Block[] = [];
      for (const post of made.posts) {
        const pub = await invoke(ctx, "publish_social_post", { postId: post.id });
        if (pub.status === "needs_approval") await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
        bl.push({ type: "draft_social", postId: post.id, category: post.category ?? undefined, platform, caption: post.caption, slides: post.slides, status: "Draft", buttons: pub.status === "needs_approval" ? [{ label: "Review", style: "secondary", href: `/tasks?approval=${pub.approval.id}` }] : undefined });
      }
      return reply(`Here's a Coming Soon post for ${prop.address}. It has no price and doesn't say it's listed. Nothing posts until you approve it.`, bl, "social_generation");
    }
  }
  // the same request twice is one post: show the one already waiting instead of stacking a second draft and a second approval
  if (!/\b(another|again|new one|different|redo|second|more|options?|variations?|versions?)\b/i.test(text) && requestedCount(text) <= 1) {
    const want = /open\s*house/i.test(text) ? "open house" : /\bprice\b/i.test(text) ? "price" : /\b(sold|congrat\w*|just closed)\b/i.test(text) ? "sold" : "just listed";
    const dup = (await ctx.store.list("social_posts", ctx.userId)).filter((p) => p.property_id === prop.id && p.platform === platform && ["draft", "pending_approval", "ready"].includes(p.status) && Math.abs(ctx.now.getTime() - new Date(p.created_at).getTime()) < 48 * 3_600_000 * 4 && p.caption.toLowerCase().replace(/[^a-z ]/g, " ").includes(want) ).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (dup) {
      const stage0 = await stageOfProperty(ctx, prop);
      const warn: Block[] = want === "just listed" && (stage0 === "under_contract" || stage0 === "sold" || stage0 === "upcoming") ? [{ type: "notice", tone: "warn", title: "Check the wording", body: `${prop.address} is saved as ${stage0 === "under_contract" ? "under contract" : stage0 === "sold" ? "sold" : "coming soon (not live yet)"}, so the “Just Listed” draft waiting may not be accurate.`, buttons: stage0 === "sold" ? [{ label: "Make a Just Sold post", style: "secondary", action: { type: "prompt", text: `Make a Just Sold post for ${prop.address}` } }] : stage0 === "upcoming" ? [{ label: "Make it a Coming Soon post", style: "secondary", action: { type: "prompt", text: `Make a Coming Soon post for ${prop.address}` } }] : undefined }] : [];
      return reply(`You already have ${/^[aeiou]/i.test(want) ? "an" : "a"} ${want} post for ${prop.address} waiting. I didn't make a second one.`, [...warn, { type: "choice", title: "What next?", buttons: [{ label: "Open it", style: "primary", href: `/content?post=${dup.id}` }, { label: "Make another version", style: "secondary", action: { type: "prompt", text: `Make another ${want} post for ${prop.address}` } }] }], "smalltalk");
    }
  }
  const count = requestedCount(text);
  const blocks: Block[] = [];
  const made: SocialPost[] = [];
  const attach = async (post: SocialPost) => {
    const pub = await invoke(ctx, "publish_social_post", { postId: post.id });
    if (pub.status === "needs_approval") await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
    blocks.push({ type: "draft_social", postId: post.id, category: post.category ?? undefined, platform, caption: post.caption, slides: post.slides, status: "Draft", buttons: pub.status === "needs_approval" ? [{ label: "Review", style: "secondary", href: `/tasks?approval=${pub.approval.id}` }, { label: "Approve post", style: "primary", approvalId: pub.approval.id }] : undefined });
    made.push(post);
  };
  if (count > 1) {
    const facts = verifiedFacts(prop);
    const options: { label: string; post: Extract<Block, { type: "draft_social" }> }[] = [];
    // different angles AND different looks: each option gets its own design so they don't read as the same post three times
    for (const [ai, angle] of postAngles(prop, facts, images, ctx).slice(0, count).entries()) {
      const post = ((await TOOLS.create_social_post.run(ctx, { platform, property_id: prop.id, hashtags: ["#RealEstate", "#HomesForSale"], caption: angle.caption.replace(/\n{3,}/g, "\n\n"), slides: await designSlides(ctx, prop, angle.slides, "just_listed", ai * 2, platform) })) as any).data.post as SocialPost;
      const pub = await invoke(ctx, "publish_social_post", { postId: post.id });
      if (pub.status === "needs_approval") await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
      options.push({ label: angle.name, post: { type: "draft_social", postId: post.id, category: post.category ?? undefined, platform, caption: post.caption, slides: post.slides, status: "Draft", buttons: pub.status === "needs_approval" ? [{ label: "Review", style: "secondary", href: `/tasks?approval=${pub.approval.id}` }, { label: "Approve post", style: "primary", approvalId: pub.approval.id }] : undefined } });
      made.push(post);
    }
    blocks.push({ type: "post_set", title: `${options.length} ${platform === "instagram_story" || platform === "tiktok" ? "story" : "post"} options`, options });
    if (!images.length) blocks.push({ type: "notice", tone: "info", title: "Add your photos", body: "I don't have photos for this home yet. Add yours (use your own photos, or ones you have permission to use) and every option updates.", buttons: [{ label: "Add photos", style: "quiet", href: `/properties/${prop.id}` }] });
    return reply(`Here are ${options.length} ${platform === "instagram_story" || platform === "tiktok" ? "stories" : "posts"} for ${prop.address}. Swipe to compare, then pick the one you like. Nothing posts until you approve it.`, blocks, "social_generation");
  }
  // "make another version": a genuinely different angle, never a word-for-word copy of what's already there
  if (/\b(another|different|new version|one more|second|redo)\b/i.test(text) && !/open\s*house/i.test(text) && !ev && !/\bcoming soon\b/i.test(text)) {
    const mine = (await ctx.store.list("social_posts", ctx.userId)).filter((p) => p.property_id === prop!.id && p.platform === platform);
    const facts = verifiedFacts(prop);
    const all = postAngles(prop, facts, images, ctx);
    const seen = new Set(mine.map((p) => p.caption.split("\n")[0].trim().toLowerCase()));
    const angle = all.find((a) => !seen.has(a.caption.split("\n")[0].trim().toLowerCase())) ?? all[mine.length % all.length];
    const made2 = ((await TOOLS.create_social_post.run(ctx, { platform, property_id: prop.id, hashtags: ["#RealEstate", "#HomesForSale"], caption: angle.caption.replace(/\n{3,}/g, "\n\n"), slides: await designSlides(ctx, prop, angle.slides, "just_listed", mine.length * 2 + 1, platform) })) as any).data.post as SocialPost;
    await attach(made2);
    return reply(`Here's another version for ${prop.address}: the “${angle.name}” angle. Your first one is still there. Nothing posts until you approve it.`, blocks, "social_generation");
  }
  let post: SocialPost;
  const wantsOpenHouse = /open\s*house/i.test(text);
  if (!ev && wantsOpenHouse) {
    // an open house post with no date on the calendar yet: build it now, add the day and time once she gives them
    const s = await openHouseSocial(ctx, prop, null, null, images);
    post = ((await TOOLS.create_social_post.run(ctx, { platform, category: "open_house", caption: s.caption, hashtags: s.hashtags, slides: await designSlides(ctx, prop, s.slides, "open_house", 0, platform), property_id: prop.id })) as any).data.post;
    await attach(post);
    ctx.state.pending = { kind: "clarify", intent: "open_house", slots: { text: `open house at ${prop.address}${prop.city ? `, ${prop.city}` : ""}${prop.state ? ` ${prop.state}` : ""}` }, missing: "date" }; // her next message ("Saturday 1 to 4") books it
    await persistState(ctx);
    blocks.push({ type: "notice", tone: "info", title: "Add the day and time", body: `Tell me when it is (like "Saturday 1 to 4") and I'll put the open house on your calendar and add the date to the post.` });
    if (!images.length) blocks.push({ type: "notice", tone: "info", title: "Want real photos in this?", body: "Add photos of the home on its property page (use your own photos, or ones you have permission to use) and I'll use them. I never use stock images for a real property.", buttons: [{ label: "Add your own instead", style: "quiet", href: `/properties/${prop.id}` }] });
    return reply(`Here's an Instagram carousel for the open house at ${prop.address}.`, blocks, "social_generation");
  }
  if (ev && /open house|carousel/i.test(text) || (ev && !/just listed|price/i.test(text))) {
    const s = await openHouseSocial(ctx, prop, new Date(ev!.start_at), new Date(ev!.end_at), images);
    post = ((await TOOLS.create_social_post.run(ctx, { platform, category: "open_house", caption: s.caption, hashtags: s.hashtags, slides: await designSlides(ctx, prop, s.slides, "open_house", 0, platform), property_id: prop.id, event_id: ev!.id })) as any).data.post;
  } else {
    const facts = verifiedFacts(prop);
    const kind = /price/i.test(text) ? "Price Improvement" : "Just Listed";
    post = ((await TOOLS.create_social_post.run(ctx, {
      platform, property_id: prop.id, hashtags: ["#RealEstate", "#HomesForSale"],
      caption: [`${kind}! ${classifyProperty({ address: prop.address, beds: prop.beds, baths: prop.baths, description: prop.description }).group === "commercial" ? "🏢" : "🏡"}`, "", prop.address + (prop.city ? `, ${prop.city}` : ""), facts.join(" • "), "", "Message me for details or a private showing."].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"),
      slides: await designSlides(ctx, prop, [{ role: "hero", headline: prop.address, sub: kind, image_id: images[0] ?? null }, { role: "highlight", headline: facts.join(" • ") || "See it in person", image_id: images[1] ?? images[0] ?? null }, { role: "cta", headline: "Let's talk", sub: ctx.profile.full_name, image_id: null }], kind === "Price Improvement" ? "price_improvement" : "just_listed", 0, platform), category: kind === "Price Improvement" ? "price_improvement" : "just_listed",
    })) as any).data.post;
  }
  await attach(post);
  // advertising a home that is under contract, sold or not live yet as "Just Listed" is a false advertisement: say so
  if (post.category !== "open_house" && !/open\s*house/i.test(text)) {
    const stage = await stageOfProperty(ctx, prop);
    if (stage === "under_contract" || stage === "sold" || stage === "upcoming") {
      const label = stage === "under_contract" ? "under contract" : stage === "sold" ? "sold" : "coming soon (not live yet)";
      blocks.push({ type: "notice", tone: "warn", title: "Check the wording", body: `${prop.address} is saved as ${label}, so ${post.category === "price_improvement" ? "a price reduction" : "“Just Listed”"} may not be accurate${stage === "under_contract" ? " (an offer was accepted, so a lower public price is misleading)" : ""}. Review it before you approve.`, buttons: stage === "upcoming" ? [{ label: "Make it a Coming Soon post", style: "secondary", action: { type: "prompt", text: `Make a Coming Soon post for ${prop.address}` } }] : stage === "sold" ? [{ label: "Make a Just Sold post", style: "secondary", action: { type: "prompt", text: `Make a Just Sold post for ${prop.address}` } }] : undefined });
    }
  }
  if (!images.length) blocks.push({ type: "notice", tone: "info", title: "Want real photos in this?", body: "Add photos of the home on its property page (use your own photos, or ones you have permission to use) and I'll use them. I never use stock images for a real property.", buttons: [{ label: "Add your own instead", style: "quiet", href: `/properties/${prop.id}` }] });
  return reply(platform === "tiktok" ? `Here's a TikTok cover for ${prop.address}.` : platform === "instagram_story" ? `Here's an Instagram story for ${prop.address}.` : `Here's an Instagram carousel for ${prop.address}.`, blocks, "social_generation");
}

export async function draftEmailHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  // "…, sign it QA TEST Agent": the name the agent asked for closes the email, and it is not a recipient
  const signAs = /[,.;]?\s*\bsign(?:ed)?(?:\s+(?:it|this|the (?:email|message)|off))?(?:\s+(?:as|with|off as))?\s+([^,.;]{2,60}?)\s*[.!]?\s*$/i.exec(text)?.[1]?.trim();
  if (signAs) { text = text.replace(/[,.;]?\s*\bsign(?:ed)?(?:\s+(?:it|this|the (?:email|message)|off))?(?:\s+(?:as|with|off as))?\s+[^,.;]{2,60}?\s*[.!]?\s*$/i, "").trim(); ctx = { ...ctx, profile: { ...ctx.profile, full_name: signAs } }; }
  text = text.replace(/^\s*(?:(?:yah|yeah|yep|yes|ok|okay|sure|and|then|go ahead)[,.!\s]+)+/i, "");
  const addrIn = parseAddress(text);
  const typedEmail = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text)?.[0] ?? null;
  // "starts Hi Hollis and Mae": the agent wrote the greeting, so that is the greeting
  const greet = /\b(?:starts?|begin(?:s|ning)?|opens?)\s+(?:with\s+)?["“]?(?:Hi|Hello|Dear|Hey)\s+([\p{Lu}][\p{L}'’-]+(?:\s+(?:and|&)\s+[\p{Lu}][\p{L}'’-]+)?)/u.exec(text)?.[1] ?? null;
  // "Email him the homes we saw…": him/her/them means the person we were just talking about, never a street or a house name later in the sentence
  const pronTo = /^\s*(?:(?:please|can you|could you)\s+)?(?:email|e-mail|write|draft|send)\s+(?:to\s+)?(?:him|her|them)\b/i.test(text) && ctx.state.last_contact_ids?.length === 1;
  const names = pronTo ? [] : capitalisedNames((addrIn ? text.replace(addrIn, " ") : text).replace(/^\s*(?:(?:tell|let|notify)\s+(?:(?:her|him|them)\b(?:\s+know)?|(?=\p{Lu}))(?:\s+know)?)/iu, " ").replace(/^\s*(?:(?:please|can you|could you)\s+)?(?:draft|write|compose|send|prepare|create|make|email|e-mail)\b/i, " ").replace(/\b(?:starts?|begin(?:s|ning)?|opens?)\s+(?:with\s+)?["“]?(?:Hi|Hello|Dear|Hey)\s+[\p{Lu}][\p{L}'’-]+(?:\s+(?:and|&)\s+[\p{Lu}][\p{L}'’-]+)?/gu, " ")).filter((n) => !/^(?:Hi|Hello|Dear|Hey|Draft|Now|Can|Please)\b/.test(n) && !/\b(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Court|Ct|Drive|Dr|Way|Boulevard|Blvd|Place|Pl|Circle|Cir|Terrace|Square|Sq|Highway|Hwy)\b\.?$/i.test(n));
  let c: Contact | null = null;
  // typed in lowercase ("email priya about the showing"): still a saved client by first name, and two of them is a question
  if (!pronTo && !names.length) {
    const known = await mentionedContacts(ctx, (greet ? `${greet} ` : "") + text.replace(/^\s*(?:(?:please|can you|could you)\s+)?(?:email|e-mail|write|draft|send|tell|let|notify)\b/i, " "));
    const amb = greet ? null : ambiguousFirstName(text, known);
    if (amb) return askWhichPerson(text, amb);
    if (known.length >= 1) c = known[0];
  }
  if (!c && greet) c = (await mentionedContacts(ctx, greet))[0] ?? null; // "starts Hi Hollis and Mae": Hollis is who it is for
  const role = /\b(?:to\s+)?the\s+(listing agent|buyer'?s?\s+agent|sellers?|lender|title (?:company|officer)|inspector|appraiser)\b/i.exec(text)?.[1]?.toLowerCase() ?? null;
  for (const n of names) { const r = (await TOOLS.get_contact.run(ctx, { name: n })) as any; if (r.ok && r.data.contacts.length === 1) { c = r.data.contacts[0]; break; } if (r.ok && r.data.contacts.length > 1) return reply(`Which ${n}?`, [{ type: "choice", title: `Which ${n}?`, buttons: r.data.contacts.slice(0, 5).map((x: Contact) => ({ label: `${x.name}${x.email ? ` · ${x.email}` : ""}`, style: "secondary" as const, action: { type: "prompt", text: text.replace(n, x.name) } })) }]); }
  if (!c && !names.length && !typedEmail && !greet && !role && ctx.state.last_contact_ids?.length === 1) c = await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]);
  // someone was named but isn't a contact (a listing agent, a buyer's agent): the draft is still written, addressed by name, and they can be added
  const outsider = !c ? names.find((n) => n.includes(" ")) ?? names[0] ?? null : null;
  if (!c && !outsider && !typedEmail && !role) return askBack(ctx, "draft_email", text, "name", "Who is the email for?");
  const prefs = c ? await contactFacts(ctx, c, { confirmedOnly: true }) : [];
  // a saved "updates by text only" is the agent's own preference (even if Mila filed it as inferred): it decides the channel when the words don't
  const channel = channelOf(text, c ? await contactFacts(ctx, c) : []);
  if (channel === "text") return replyText(ctx, c, outsider ?? role ?? "", text, greet);
  const recipientFirst = greet ?? (c ? firstName(c.name) : outsider ? firstName(outsider) : role ? "there" : "");
  // "email Dana" with nothing to say and nobody saved: ask, rather than invent a message for a stranger
  if (!c && !typedEmail && !role && contentOf(text, [outsider ?? "", greet ?? ""]).replace(/[\s.!?]+/g, "").length < 4) return askBack(ctx, "draft_email", text, "name", `I don't have ${outsider} in your contacts. Who should the email go to, and what should it say? (Say their name, or add them first.)`);
  // "email Maya the details for the apartments": her booked showings, with day, time and place, are the details
  const sched = c && /\b(details|schedule|itinerary|showings?|tours?|apartments?|units?|properties|homes|addresses)\b/i.test(text) ? (await upcomingWith(ctx, c)).filter((e) => e.kind === "showing" || /showing|tour/i.test(e.title)).slice(0, 6) : [];
  const spec: Spec = { channel: "email", purpose: purposeOf(text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " ")), content: contentOf(text, [c?.name ?? "", c ? firstName(c.name) : "", outsider ?? "", greet ?? ""]), address: addrIn, recipientFirst, greetingNames: greet, me: firstName(ctx.profile.full_name) };
  const facts = prefs;
  const ai = await llmDraftEmail(ctx, text, c?.name ?? outsider ?? role, facts);
  const schedLines = sched.map((e) => `• ${fmtDay(e.start_at, ctx.tz)} at ${fmtTime(e.start_at, ctx.tz)}: ${(e.location || e.title.split("—").pop() || "").trim()}`);
  const body = schedLines.length ? finishEmailBody(`Hi ${firstName(c!.name)},\n\nHere is your showing schedule:\n\n${schedLines.join("\n")}\n\nLet me know if any time needs to change, and tell me what you think of each place.\n\nBest,\n${firstName(ctx.profile.full_name)}`, ctx.profile) : ai?.body ?? finishEmailBody(bodyOf(spec), ctx.profile);
  const subject = schedLines.length ? "Your showing schedule" : ai?.subject ?? subjectOf(spec);
  // "Desmond's email is x@y": the address the agent typed goes on the contact (and on the draft)
  if (c && typedEmail && !c.email) { await ctx.store.update("contacts", ctx.userId, c.id, { email: typedEmail }); c = { ...c, email: typedEmail }; }
  const toEmails = typedEmail ? [typedEmail] : c?.email ? [c.email] : [];
  const d = ((await TOOLS.draft_email.run(ctx, { contact_id: c?.id ?? null, to_emails: c ? [] : toEmails, subject, body, property_id: null })) as any).data.draft as EmailDraft;
  ctx.state.last_draft_id = d.id; ctx.state.last_draft_at = Date.now(); ctx.state.last_text = null;
  const out = await invoke(ctx, "send_email", { draftId: d.id });
  const toLabel = c ? `${c.name}${c.email ? ` <${c.email}>` : ""}` : `${outsider ?? (role ? `the ${role}` : "")}${typedEmail ? ` <${typedEmail}>` : ""}`.trim();
  const blocks: Block[] = [{ type: "draft_email", draftId: d.id, to: toLabel, subject, body, status: "Draft", buttons: out.status === "needs_approval" ? [{ label: "Edit", style: "secondary", href: `/tasks?approval=${out.approval.id}` }, { label: "Open in email app", style: "primary", approvalId: out.approval.id }] : undefined }];
  if (out.status === "needs_approval") await ctx.store.update("email_drafts", ctx.userId, d.id, { status: "pending_approval" });
  if (c && !c.email) blocks.push({ type: "notice", tone: "warn", title: `${c.name} has no email address`, body: "Add one in their profile before sending.", buttons: [{ label: "Open profile", style: "secondary", href: `/contacts/${c.id}` }] });
  if (!c && outsider) blocks.push({ type: "notice", tone: "info", title: `${outsider} isn't in your contacts`, body: "I wrote the draft anyway. Add them to keep their email and history.", buttons: [{ label: `Add ${firstName(outsider)} to contacts`, style: "secondary", action: { type: "prompt", text: `Add ${outsider} as a contact` } }] });
  if (wantsPhotos(text)) blocks.push(...(await sharePhotosBlock(ctx, text, body))); // photos go in an email only when the agent says so
  const who = c ? firstName(c.name) : outsider ? firstName(outsider) : role ? `the ${role}` : "them";
  return reply(ai ? `Here's a draft for ${who}.` : `Here's a draft for ${who}, written from what you told me. Edit anything before you send it.`, blocks, "email_generation");
}

/** A text message: short, in the agent's voice, from the specifics they gave. It opens in their own Messages app; Mila never sends it. */
async function replyText(ctx: Ctx, c: Contact | null, outsider: string, text: string, greet: string | null): Promise<HandlerOut> {
  const first = c ? firstName(c.name) : outsider ? firstName(outsider) : "";
  const words = [c?.name ?? "", first, outsider, greet ?? ""];
  const content = contentOf(text, words);
  const spec: Spec = { channel: "text", purpose: purposeOf(text), content, address: parseAddress(text), recipientFirst: first || "there", greetingNames: greet, me: firstName(ctx.profile.full_name) };
  const msg = bodyOf(spec);
  const phone = c?.phone?.replace(/[^\d+]/g, "") ?? "";
  const href = `sms:${phone}?&body=${encodeURIComponent(msg)}`;
  if (c) await logContactEvent(ctx, c.id, "text", "Text drafted", msg);
  if (c) { ctx.state.last_contact_ids = [c.id]; ctx.state.pending_text = { contact_id: c.id, name: c.name, at: Date.now() }; }
  ctx.state.last_text = { to: c?.id ?? null, name: c?.name ?? outsider, text: msg, at: Date.now() };
  await persistState(ctx);
  return reply(`Here's the text${first ? ` to ${first}` : ""}:\n\n“${msg}”\n\n${phone ? "Tap below and it opens in your Messages, ready to send." : `${first ? `I don't have a number for ${first} yet — tap` : "Tap"} below to pick them in Messages.`} I don't send texts myself, so nothing goes out until you tap Send.`, [{
    type: "choice", title: `Text ${first || "them"}`,
    buttons: [{ label: "Open in Messages", style: "primary", href }, { label: "Copy text", style: "secondary", action: { type: "copy", text: msg } as never }, ...(c ? [{ label: "Open profile", style: "quiet" as const, href: `/contacts/${c.id}` }] : [])],
  }], "chat_simple");
}

/** "that draft is too generic, rewrite it to say …": the draft already made is rewritten in place, to the same person. */
export async function reviseDraftHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const instruction = text.replace(/^[^,.]*?(?:too generic|doesn'?t (?:mention|say|include)[^.,]*|not right|wrong)[.,]?\s*/i, "").replace(/^\s*(?:(?:ok|okay|so|then|please)[,\s]+)*(?:rewrite|redo|rework|revise|fix|change|update)\s+(?:it|that|the draft|this|the email|the text)\s*(?:to say|so it says|:|-|and|to)?\s*/i, "").trim();
  if (!instruction) return reply("Tell me what the message should say and I'll rewrite it.", [], "smalltalk");
  const lastText = ctx.state.last_text && Date.now() - ctx.state.last_text.at < 60 * 60_000 ? ctx.state.last_text : null;
  const draft = ctx.state.last_draft_id ? await ctx.store.get("email_drafts", ctx.userId, ctx.state.last_draft_id) : null;
  if (draft && (!lastText || (ctx.state.last_draft_at ?? 0) >= lastText.at)) {
    const c = draft.contact_id ? await ctx.store.get("contacts", ctx.userId, draft.contact_id) : null;
    const spec: Spec = { channel: "email", purpose: purposeOf(instruction), content: instruction, address: parseAddress(`${instruction} ${draft.subject}`), recipientFirst: c ? firstName(c.name) : /^Hi ([^,\n]+)/.exec(draft.body)?.[1] ?? "there", me: firstName(ctx.profile.full_name) };
    const subject = subjectOf(spec), body = finishEmailBody(bodyOf(spec), ctx.profile);
    await ctx.store.update("email_drafts", ctx.userId, draft.id, { subject, body } as never);
    return reply("Rewritten. This replaces the earlier draft, and nothing was sent.", [{ type: "draft_email", draftId: draft.id, to: c ? `${c.name}${c.email ? ` <${c.email}>` : ""}` : (draft.to_emails[0] ?? ""), subject, body, status: "Draft" }], "email_generation");
  }
  if (lastText) {
    const spec: Spec = { channel: "text", purpose: purposeOf(instruction), content: instruction, address: parseAddress(instruction), recipientFirst: firstName(lastText.name ?? "") || "there", me: firstName(ctx.profile.full_name) };
    const msg = bodyOf(spec);
    ctx.state.last_text = { ...lastText, text: msg, at: Date.now() }; await persistState(ctx);
    return reply(`Rewritten:\n\n“${msg}”\n\nNothing was sent.`, [], "chat_simple");
  }
  return reply("I don't have a draft from this chat to rewrite. Tell me who it's for and what to say, and I'll write a new one.", [], "smalltalk");
}

export { fmtDay, fmtRange };

/** "Rewrite the 14 Ridge Road just listed post without the price and beds": edits the post that is already there, keeps its type, and says exactly what changed. */
const hm = (t: { h: number; mi: number }) => { const h24 = t.h, mi = t.mi; return `${((h24 + 11) % 12) + 1}${mi ? `:${String(mi).padStart(2, "0")}` : ""} ${h24 >= 12 ? "PM" : "AM"}`; };
export async function rewritePostHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const prop = await resolveProperty(ctx, text, true);
  const posts = (await ctx.store.list("social_posts", ctx.userId)).filter((p) => !["archived", "posted"].includes(p.status) && (!prop || p.property_id === prop.id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const t = text.toLowerCase();
  const kind = /open\s*house/.test(t) ? "open house" : /price/.test(t) && /improvement|drop|reduc/.test(t) ? "price" : /sold/.test(t) ? "sold" : /just listed/.test(t) ? "just listed" : null;
  const post = (kind ? posts.find((p) => p.caption.toLowerCase().includes(kind)) : null) ?? posts[0];
  if (!post) return reply(`I don't have a post${prop ? ` for ${prop.address}` : ""} to rewrite yet. Want me to make one?`, [], "smalltalk");
  const drop: string[] = [];
  const strip = (s: string) => {
    let out = s;
    const tokens = (s.includes(" • ") ? s.split(" • ") : [s]);
    if (tokens.length > 1) out = tokens.filter((tok) => !((/price|\$/.test(t) && /without|no|remove|drop|leave out|take out|hide/.test(t) && /\$\s?\d/.test(tok)) || (/\bbeds?\b|bedrooms?/.test(t) && /\b(?:bd|bed)/i.test(tok)) || (/\bbaths?\b|bathrooms?/.test(t) && /\b(?:ba|bath)/i.test(tok)) || (/sq\s?ft|square|sqft|size/.test(t) && /sq\.? ?ft/i.test(tok)))).join(" • ");
    return out;
  };
  const without = /\b(without|w\/o|no|remove|drop|leave out|take out|hide|skip)\b/.test(t) || /\btake\b.{0,40}\bout\b/.test(t);
  // "change the headline to Coming Soon" / "I need it to say Coming Soon": the label at the top of the post changes, nothing else
  const head = /\b(?:headline|title|heading)\s+(?:to|should (?:say|be))\s+["“]?([^"”.\n]{3,30})/i.exec(text) ?? /\b(?:need|want) it to say\s+["“]?([^"”.\n]{3,30})/i.exec(text);
  if (head) {
    const label = head[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
    const swap = (x: string) => x.replace(/Just Listed|Price Improvement|Just Sold|Open House/i, label);
    let cap = swap(post.caption);
    if (/coming soon/i.test(label)) cap = cap.split("\n").filter((l) => !/offered at|\$\s?\d/i.test(l)).join("\n").replace(/\n{3,}/g, "\n\n");
    const sl = post.slides.map((x) => ({ ...x, headline: swap(x.headline), sub: x.sub ? swap(x.sub).replace(/\s*•\s*\$[\d,]+/g, "") : x.sub }));
    const done = await ctx.store.update("social_posts", ctx.userId, post.id, { caption: cap, slides: sl } as never);
    if (!done) return reply("I couldn't save that edit, so the post is unchanged.", [], "smalltalk");
    return reply(`Done. The headline now says “${label}”${/coming soon/i.test(label) ? " and I took the price off" : ""}. Same post, no new draft.`, [{ type: "draft_social", postId: post.id, category: post.category ?? undefined, platform: post.platform, caption: cap, slides: sl, status: "Draft" }], "chat_simple");
  }
  // "edit the post to add that date and time to the caption"
  if (/\badd\b.{0,40}\b(?:date|time|day)\b/.test(t)) {
    const ev = prop ? (await upcomingEvents(ctx)).find((e) => e.kind === "open_house" && e.property_id === prop.id) : undefined;
    const d = parseDate(text, ctx.now, ctx.tz), tm = parseTime(text);
    let when = "";
    if (ev) when = `${fmtDay(ev.start_at, ctx.tz)}, ${fmtShortDate(ev.start_at, ctx.tz)} • ${fmtRange(ev.start_at, ev.end_at, ctx.tz)}`;
    else if (d) when = `${d.text}${tm ? ` • ${hm(tm.start)}${tm.end ? `–${hm(tm.end)}` : ""}` : ""}`;
    if (!when) return reply("What day and time should I add? Tell me like “Sunday 1 to 3” and I'll put it in the caption.", [], "smalltalk");
    if (post.caption.includes(when)) return reply(`The caption already says “${when}”, so I left it as is.`, [], "chat_simple");
    const lines = post.caption.split("\n");
    const cap = [lines[0], `🗓 ${when}`, ...lines.slice(1)].join("\n").replace(/\n{3,}/g, "\n\n");
    const done = await ctx.store.update("social_posts", ctx.userId, post.id, { caption: cap } as never);
    if (!done) return reply("I couldn't save that edit, so the post is unchanged.", [], "smalltalk");
    return reply(`Added “${when}” to the caption of your existing post. No new draft.`, [{ type: "draft_social", postId: post.id, category: post.category ?? undefined, platform: post.platform, caption: cap, slides: post.slides, status: "Draft" }], "chat_simple");
  }
  if (without && /price/.test(t)) drop.push("the price");
  if (without && /\bbeds?\b|bedrooms?/.test(t)) drop.push("the bedrooms");
  if (without && /\bbaths?\b|bathrooms?/.test(t)) drop.push("the bathrooms");
  if (without && /sq\s?ft|square|sqft/.test(t)) drop.push("the square footage");
  let caption = post.caption.split("\n").map(strip).filter((l, i, a) => l.trim() || (a[i - 1] ?? "x").trim()).join("\n");
  if (without && /price/.test(t)) caption = caption.split("\n").filter((l) => !/^\s*(?:\p{Extended_Pictographic}\s*)?(?:list(?:ed)?(?:\s+price)?|asking|price)\b.*\$\s?\d/iu.test(l)).join("\n");
  const shorter = /\b(short|shorter|brief|trim|cut)\b/.test(t);
  if (shorter) {
    const lines = caption.split("\n"); const keep = lines.filter((l, i) => i < 4 || /^\s*(?:—|-|📞|✉|[A-Z][a-z]+ [A-Z][a-z]+\s*$)/.test(l) || i >= lines.length - 4);
    caption = keep.join("\n").replace(/\n{3,}/g, "\n\n");
  }
  if (!drop.length && !shorter) return reply("Tell me what to change in the post (for example “without the price” or “make it shorter”) and I'll edit the one you have.", [], "smalltalk");
  const slides = post.slides.map((s) => ({ ...s, headline: strip(s.headline), sub: s.sub ? strip(s.sub) : s.sub }));
  const saved = await ctx.store.update("social_posts", ctx.userId, post.id, { caption, slides } as never);
  if (!saved) return reply("I couldn't save that edit, so the post is unchanged.", [], "smalltalk");
  // verify the edit really took before saying it did, and show the result
  const after = await ctx.store.get("social_posts", ctx.userId, post.id);
  const leftover = after && drop.includes("the price") && /\$\s?\d/.test(`${after.caption} ${after.slides.map((x) => `${x.headline} ${x.sub ?? ""}`).join(" ")}`);
  if (!after || leftover) return reply(`I tried to take ${drop.join(" and ") || "that"} out of the post${prop ? ` for ${prop.address}` : ""}, but it still shows a price. Open the post and edit the text directly, or tell me exactly which line to change.`, [{ type: "choice", title: "Your post", buttons: [{ label: "Open it", style: "primary", href: `/content?post=${post.id}` }] }], "smalltalk");
  return reply(`Edited your existing post${prop ? ` for ${prop.address}` : ""} (still ${post.category ? post.category.replace(/_/g, " ") : "the same type"}; no new draft). ${drop.length ? `Removed ${drop.length > 1 ? `${drop.slice(0, -1).join(", ")} and ${drop[drop.length - 1]}` : drop[0]}.` : ""}${shorter ? " Shortened it." : ""}`, [{ type: "choice", title: "Your post", buttons: [{ label: "Open it", style: "primary", href: `/content?post=${post.id}` }] }, { type: "draft_social", postId: post.id, category: post.category ?? undefined, platform: post.platform, caption, slides, status: "Draft" }], "chat_simple");
}
