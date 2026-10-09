import { classifyProperty } from "../../property-kind";
import { fmtDay, fmtRange } from "../../time";
import type { Block, CalendarEvent, Contact, EmailDraft, Property, SocialPost, SocialSlide } from "../../types";
import { type Ctx, firstName, fullMoney } from "../context";
import { openHouseSocial, signature, verifiedFacts } from "../comms";
import { createPosts, designSlides } from "../../content/service";
import { llmDraftEmail } from "../llm";
import { contactFacts } from "../memory";
import { capitalisedNames, parseAddress } from "../nlu";
import { TOOLS, invoke } from "../tools";
import { upcomingEvents } from "./calendar";
import { type HandlerOut, reply } from "./types";
import { askBack } from "./ask";
import { persistState } from "../conversation";
import { resolveProperty } from "./listing";
import { resolveAddress } from "../property-lookup";

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
    { name: "Private showing", caption: [`Want to see ${prop.address} in person?`, "", "Private showings are open — send me a message and we'll find a time that works for you. 🔑"].join("\n"), slides: [hero("Private showings"), cta] },
    { name: "Offered at", caption: [prop.list_price && prop.verified ? `Offered at ${fullMoney(prop.list_price)} ${icon}` : `Your next home could be ${prop.address} ${icon}`, "", where, line && !prop.list_price ? line : facts.filter((f) => !/^Offered/.test(f)).join(" • "), "", "DM me for the full details."].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n"), slides: [hero(prop.list_price && prop.verified ? `Offered at ${fullMoney(prop.list_price)}` : "Now available"), hi(line || "Details on request", 2), cta] },
    { name: "Save it", caption: [`Save this one for later. 🔖`, "", where, "", "Know someone looking in the area? Send them my way."].join("\n"), slides: [hero("Save for later"), cta] },
    { name: "Ask me", caption: [`Questions about ${prop.address}?`, "", "I'm happy to walk you through it — message me anytime. 💬"].join("\n"), slides: [hero("Ask me anything"), cta] },
  ];
}

export async function socialPostHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  const platform = /\bstor(y|ies)\b/i.test(text) ? "instagram_story" : "instagram"; // Instagram feed posts and stories are what Mila makes
  const addr = parseAddress(text);
  // not about a property at all: tips, advice, how-it-works, "congrats to the Nguyens". Never reuse whatever listing came up last.
  if (!addr && !/\b(it|that|this|that one|this one|the showing|the listing|the property|the house|the home|open house)\b/i.test(text)) {
    const tip = /\b(tips?|advice|first[- ]time|how (?:it )?works|myths?|explain|educat\w*|what to know|things to know|guide)\b/i.test(text);
    const sold = /\b(sold|congrat\w*|closed|closing)\b/i.test(text);
    if (tip && !sold) {
      const category = /\b(sell(?:er|ers|ing)?|list(?:ing)? your|home ?owners?)\b/i.test(text) ? "seller_tip" : /\b(buy(?:er|ers|ing)?|first[- ]time|purchase)\b/i.test(text) ? "buyer_tip" : "education";
      const tn = /\b(\d{1,2})\s+(?:quick |simple |easy |top |great )?tips?\b/i.exec(text);
      const aud = /\btips?\s+(?:for|to help)\s+(.+?)[.?!]*$/i.exec(text)?.[1]?.trim() || (category === "seller_tip" ? "home sellers" : category === "buyer_tip" ? "home buyers" : "everyone");
      const made2 = await createPosts(ctx, { category, platforms: [platform], topic: null, tips: tn ? { n: Math.min(8, Math.max(2, Number(tn[1]))), audience: aud } : null });
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
  const refersBack = !addr && /\b(it|that|this|that one|this one|the showing|the listing|the property|the house|the home)\b/i.test(text);
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
  const images = (await ctx.store.list("property_images", ctx.userId)).filter((i) => i.property_id === prop!.id).sort((a, b) => a.position - b.position).map((i) => i.id);
  // "congrats to the Nguyens" / "sold caption" for a home: a Just Sold post, not a listing announcement
  if (/\b(sold|congrat\w*|just closed|closed on)\b/i.test(text) && !/open\s*house/i.test(text)) {
    const soldPosts = await createPosts(ctx, { category: "just_sold", platforms: [platform], propertyId: prop.id, topic: null });
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
      const post = ((await TOOLS.create_social_post.run(ctx, { platform, property_id: prop.id, hashtags: ["#RealEstate", "#HomesForSale"], caption: angle.caption.replace(/\n{3,}/g, "\n\n"), slides: await designSlides(ctx, prop, angle.slides, "just_listed", ai * 2) })) as any).data.post as SocialPost;
      const pub = await invoke(ctx, "publish_social_post", { postId: post.id });
      if (pub.status === "needs_approval") await ctx.store.update("social_posts", ctx.userId, post.id, { status: "pending_approval" });
      options.push({ label: angle.name, post: { type: "draft_social", postId: post.id, category: post.category ?? undefined, platform, caption: post.caption, slides: post.slides, status: "Draft", buttons: pub.status === "needs_approval" ? [{ label: "Review", style: "secondary", href: `/tasks?approval=${pub.approval.id}` }, { label: "Approve post", style: "primary", approvalId: pub.approval.id }] : undefined } });
      made.push(post);
    }
    blocks.push({ type: "post_set", title: `${options.length} ${platform === "instagram_story" ? "story" : "post"} options`, options });
    if (!images.length) blocks.push({ type: "notice", tone: "info", title: "Add your photos", body: "I don't have photos for this home yet. Add yours and every option updates, or send me the listing link and I'll pull them. I never use stock images for a real property.", buttons: [{ label: "Add photos", style: "quiet", href: `/properties/${prop.id}` }] });
    return reply(`Here are ${options.length} ${platform === "instagram_story" ? "stories" : "posts"} for ${prop.address}. Swipe to compare, then pick the one you like. Nothing posts until you approve it.`, blocks, "social_generation");
  }
  let post: SocialPost;
  const wantsOpenHouse = /open\s*house/i.test(text);
  if (!ev && wantsOpenHouse) {
    // an open house post with no date on the calendar yet: build it now, add the day and time once she gives them
    const s = await openHouseSocial(ctx, prop, null, null, images);
    post = ((await TOOLS.create_social_post.run(ctx, { platform, category: "open_house", caption: s.caption, hashtags: s.hashtags, slides: await designSlides(ctx, prop, s.slides, "open_house"), property_id: prop.id })) as any).data.post;
    await attach(post);
    ctx.state.pending = { kind: "clarify", intent: "open_house", slots: { text: `open house at ${prop.address}${prop.city ? `, ${prop.city}` : ""}${prop.state ? ` ${prop.state}` : ""}` }, missing: "date" }; // her next message ("Saturday 1 to 4") books it
    await persistState(ctx);
    blocks.push({ type: "notice", tone: "info", title: "Add the day and time", body: `Tell me when it is (like "Saturday 1 to 4") and I'll put the open house on your calendar and add the date to the post.` });
    if (!images.length) blocks.push({ type: "notice", tone: "info", title: "Want real photos in this?", body: "Send me the listing link and I'll pull the photos. I never use stock images for a real property.", buttons: [{ label: "Add your own instead", style: "quiet", href: `/properties/${prop.id}` }] });
    return reply(`Here's an Instagram carousel for the open house at ${prop.address}.`, blocks, "social_generation");
  }
  if (ev && /open house|carousel/i.test(text) || (ev && !/just listed|price/i.test(text))) {
    const s = await openHouseSocial(ctx, prop, new Date(ev!.start_at), new Date(ev!.end_at), images);
    post = ((await TOOLS.create_social_post.run(ctx, { platform, category: "open_house", caption: s.caption, hashtags: s.hashtags, slides: await designSlides(ctx, prop, s.slides, "open_house"), property_id: prop.id, event_id: ev!.id })) as any).data.post;
  } else {
    const facts = verifiedFacts(prop);
    const kind = /price/i.test(text) ? "Price Improvement" : "Just Listed";
    post = ((await TOOLS.create_social_post.run(ctx, {
      platform, property_id: prop.id, hashtags: ["#RealEstate", "#HomesForSale"],
      caption: [`${kind}! ${classifyProperty({ address: prop.address, beds: prop.beds, baths: prop.baths, description: prop.description }).group === "commercial" ? "🏢" : "🏡"}`, "", prop.address + (prop.city ? `, ${prop.city}` : ""), facts.join(" • "), "", "Message me for details or a private showing."].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"),
      slides: await designSlides(ctx, prop, [{ role: "hero", headline: prop.address, sub: kind, image_id: images[0] ?? null }, { role: "highlight", headline: facts.join(" • ") || "See it in person", image_id: images[1] ?? images[0] ?? null }, { role: "cta", headline: "Let's talk", sub: ctx.profile.full_name, image_id: null }], kind === "Price Improvement" ? "price_improvement" : "just_listed"), category: kind === "Price Improvement" ? "price_improvement" : "just_listed",
    })) as any).data.post;
  }
  await attach(post);
  if (!images.length) blocks.push({ type: "notice", tone: "info", title: "Want real photos in this?", body: "Send me the listing link and I'll pull the photos. I never use stock images for a real property.", buttons: [{ label: "Add your own instead", style: "quiet", href: `/properties/${prop.id}` }] });
  return reply(`Here's ${/^[aeiou]/i.test(platform) ? "an" : "a"} ${platform} carousel for ${prop.address}.`, blocks, "social_generation");
}

export async function draftEmailHandler(ctx: Ctx, text: string): Promise<HandlerOut> {
  text = text.replace(/^\s*(?:(?:yah|yeah|yep|yes|ok|okay|sure|and|then|go ahead)[,.!\s]+)+/i, "");
  const addrIn = parseAddress(text);
  // "Email him the homes we saw…": him/her/them means the person we were just talking about, never a street or a house name later in the sentence
  const pronTo = /^\s*(?:(?:please|can you|could you)\s+)?(?:email|e-mail|write|draft|send)\s+(?:to\s+)?(?:him|her|them)\b/i.test(text) && ctx.state.last_contact_ids?.length === 1;
  const names = pronTo ? [] : capitalisedNames((addrIn ? text.replace(addrIn, " ") : text).replace(/^\s*(?:(?:tell|let|notify)\s+(?:(?:her|him|them)\b(?:\s+know)?|(?=\p{Lu}))(?:\s+know)?)/iu, " ").replace(/^\s*(?:(?:please|can you|could you)\s+)?(?:draft|write|compose|send|prepare|create|make|email|e-mail)\b/i, " "));
  let c: Contact | null = null;
  for (const n of names) { const r = (await TOOLS.get_contact.run(ctx, { name: n })) as any; if (r.ok && r.data.contacts.length === 1) { c = r.data.contacts[0]; break; } if (r.ok && r.data.contacts.length > 1) return reply(`Which ${n}?`, [{ type: "choice", title: `Which ${n}?`, buttons: r.data.contacts.slice(0, 5).map((x: Contact) => ({ label: `${x.name}${x.email ? ` · ${x.email}` : ""}`, style: "secondary" as const, action: { type: "prompt", text: text.replace(n, x.name) } })) }]); }
  // someone was named but isn't a contact: say so, never quietly send the draft to whoever came up last
  if (!c && names.length) return askBack(ctx, "draft_email", text, "name", `I don't have ${names[0]} in your contacts. Who should the email go to? (Say their name, or add them first.)`);
  if (!c && ctx.state.last_contact_ids?.length === 1) c = await ctx.store.get("contacts", ctx.userId, ctx.state.last_contact_ids[0]);
  if (!c) return askBack(ctx, "draft_email", text, "name", "Who is the email for?");
  const facts = await contactFacts(ctx, c);
  const topic = text.replace(/^.*?\b(?:about|regarding|saying|to say|that)\b\s*/i, "").trim() || text;
  const ai = await llmDraftEmail(ctx, text, c.name, facts);
  const subject = ai?.subject ?? `Following up${topic && topic !== text ? ` — ${topic.slice(0, 50)}` : ""}`;
  const body = ai?.body ?? `Hi ${firstName(c.name)},\n\n${topic && topic !== text ? `I wanted to follow up about ${topic.replace(/[.!?]+$/, "")}.` : "I wanted to follow up."} Let me know a good time to talk.\n\n${signature(ctx.profile)}`;
  const d = ((await TOOLS.draft_email.run(ctx, { contact_id: c.id, subject, body })) as any).data.draft as EmailDraft;
  const out = await invoke(ctx, "send_email", { draftId: d.id });
  const blocks: Block[] = [{ type: "draft_email", draftId: d.id, to: `${c.name}${c.email ? ` <${c.email}>` : ""}`, subject, body, status: "Draft", buttons: out.status === "needs_approval" ? [{ label: "Edit", style: "secondary", href: `/tasks?approval=${out.approval.id}` }, { label: "Open in email app", style: "primary", approvalId: out.approval.id }] : undefined }];
  if (out.status === "needs_approval") await ctx.store.update("email_drafts", ctx.userId, d.id, { status: "pending_approval" });
  if (!c.email) blocks.push({ type: "notice", tone: "warn", title: `${c.name} has no email address`, body: "Add one in their profile before sending.", buttons: [{ label: "Open profile", style: "secondary", href: `/contacts/${c.id}` }] });
  return reply(ai ? `Here's a draft for ${firstName(c.name)}.` : `Here's a simple draft for ${firstName(c.name)}.`, blocks, "email_generation");
}

export { fmtDay, fmtRange };
