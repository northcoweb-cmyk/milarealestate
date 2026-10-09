import type { SocialPlatform, SocialSlide } from "../types";

/**
 * Deterministic post builder. No AI needed, no invented facts: listing posts use only
 * verified property facts; tips are evergreen and avoid state-specific legal claims.
 * (When an AI provider is configured the service layer may polish the wording.)
 */

export type Category =
  | "just_listed" | "open_house" | "price_improvement" | "just_sold"
  | "buyer_tip" | "seller_tip" | "education" | "market_update" | "local" | "personal_brand";

export interface CategoryDef { key: Category; label: string; blurb: string; needsProperty: boolean; group: "Listings" | "Education" | "Brand" }

export const CATEGORIES: CategoryDef[] = [
  { key: "just_listed", label: "Just listed", blurb: "Announce a new listing", needsProperty: true, group: "Listings" },
  { key: "open_house", label: "Open house", blurb: "Invite people to an open house", needsProperty: true, group: "Listings" },
  { key: "price_improvement", label: "Price improvement", blurb: "Announce a price change", needsProperty: true, group: "Listings" },
  { key: "just_sold", label: "Just sold", blurb: "Celebrate a closing", needsProperty: true, group: "Listings" },
  { key: "buyer_tip", label: "Buyer tip", blurb: "Helpful advice for buyers", needsProperty: false, group: "Education" },
  { key: "seller_tip", label: "Seller tip", blurb: "Helpful advice for sellers", needsProperty: false, group: "Education" },
  { key: "education", label: "How it works", blurb: "Explain a step of the process", needsProperty: false, group: "Education" },
  { key: "market_update", label: "Market check-in", blurb: "Start a market conversation", needsProperty: false, group: "Brand" },
  { key: "local", label: "Local & community", blurb: "Engage your neighborhood", needsProperty: false, group: "Brand" },
  { key: "personal_brand", label: "About me", blurb: "Introduce yourself", needsProperty: false, group: "Brand" },
];

/** What Mila makes posts for today: Instagram feed posts (1080×1350) and Instagram stories (1080×1920). */
export const PLATFORMS: { key: SocialPlatform; label: string; limit: number; carousel: boolean }[] = [
  { key: "instagram", label: "Instagram post", limit: 2200, carousel: true },
  { key: "instagram_story", label: "Instagram story", limit: 2200, carousel: false },
];
/** Older posts may still be on platforms we no longer create for; they keep working. */
const LEGACY_LIMITS: Record<string, number> = { facebook: 5000, tiktok: 2200, linkedin: 3000, x: 280 };
export const platformLimit = (p: SocialPlatform) => PLATFORMS.find((x) => x.key === p)?.limit ?? LEGACY_LIMITS[p] ?? 2200;

export interface BuildInput {
  category: Category;
  platform: SocialPlatform;
  variant?: number;
  name: string;
  role?: string;
  brokerage?: string | null;
  market?: string; // "Montgomery County, MD"
  property?: { address: string; city?: string | null; state?: string | null; zip?: string | null; facts: string[]; details?: string[]; descriptors?: string[]; fullAddress?: string; placeLine?: string } | null;
  when?: { day: string; range: string } | null; // for open houses
  topic?: string | null;
  /** "5 tips for first-time buyers": how many tips, and for whom */
  tips?: { n: number; audience: string } | null;
  /** the buyers the agent named on a sold post: "the Nguyens" */
  client?: string | null;
  /** Shown on the last image's button, e.g. "Call or text 301.509.7280". Defaults to the agent's name. */
  contact?: string | null;
}
export interface Built { caption: string; hashtags: string[]; slides: SocialSlide[] }

// ---------------------------------------------------------------- evergreen tip banks
interface Tip { hook: string; points: string[]; cta: string }
const BUYER_TIPS: Tip[] = [
  { hook: "Get pre-approved before you shop", points: ["It shows sellers you're serious", "It sets a realistic budget", "It can speed up your offer"], cta: "Not sure where to start? Message me." },
  { hook: "Make a list of must-haves vs. nice-to-haves", points: ["Must-haves: the non-negotiables", "Nice-to-haves: the bonuses", "Revisit the list after each tour"], cta: "I'll help you narrow it down." },
  { hook: "Look beyond the staging", points: ["Check the roof, windows and HVAC age", "Notice water stains and odors", "Ask what's included in the sale"], cta: "I'll walk through homes with you." },
  { hook: "Budget for more than the mortgage", points: ["Taxes and insurance", "Maintenance and repairs", "Utilities and HOA fees if any"], cta: "Let's map out your real monthly number." },
  { hook: "Don't skip the inspection", points: ["It uncovers issues you can't see", "It gives you negotiating power", "It helps you plan for the future"], cta: "I can recommend trusted inspectors." },
  { hook: "Visit at different times of day", points: ["Morning vs. evening traffic", "Neighborhood noise levels", "Parking and light"], cta: "Want to tour a few places this week?" },
  { hook: "Keep your finances steady while you're buying", points: ["Avoid new big purchases or new debt", "Keep documents organized", "Ask your lender before major changes"], cta: "Happy to connect you with a lender." },
  { hook: "Think about resale from day one", points: ["Layout and natural light", "Location and commute", "Condition of big-ticket items"], cta: "Let's find a home that fits now and later." },
  { hook: "Be ready to move when the right home appears", points: ["Pre-approval in hand", "Know your top priorities", "Have questions ready for the tour"], cta: "Tell me what you're looking for." },
  { hook: "Ask about the neighborhood, not just the house", points: ["Schools, parks and shops", "Future development plans", "What neighbors say"], cta: "Ask me anything about the area." },
];
const SELLER_TIPS: Tip[] = [
  { hook: "First impressions start at the curb", points: ["Tidy the yard and entry", "Fresh paint on the front door", "Clean windows and lighting"], cta: "Want a quick pre-listing walkthrough?" },
  { hook: "Declutter before the photos", points: ["Clear counters and surfaces", "Pack up personal items", "Let each room breathe"], cta: "I'll share my prep checklist." },
  { hook: "Price it right from day one", points: ["Compare recent nearby sales", "Consider condition and updates", "The first weeks matter most"], cta: "Curious what your home could be worth? Message me." },
  { hook: "Small repairs add up", points: ["Fix leaky faucets and loose handles", "Touch up scuffed paint", "Replace burnt-out bulbs"], cta: "I can help you prioritize." },
  { hook: "Make your home easy to show", points: ["Flexible showing times", "Neutral smells and tidy rooms", "Pets and valuables planned for"], cta: "Let's plan your showing schedule." },
  { hook: "Great photos change everything", points: ["Natural light on", "Straight lines, clean angles", "Professional photography"], cta: "Ask about my listing marketing plan." },
  { hook: "Know your net, not just your price", points: ["Agent and closing costs", "Repairs or credits you might offer", "Your timeline and next move"], cta: "I'll walk you through a net sheet." },
  { hook: "Disclosures matter", points: ["Rules vary by state", "Be honest about known issues", "Your agent and broker can guide you"], cta: "Questions? I'm happy to help." },
  { hook: "Plan your move before you list", points: ["Where will you go next?", "Timing between sale and purchase", "Storage and movers"], cta: "Let's build a timeline together." },
  { hook: "Think like a buyer", points: ["What would you want to see online?", "What questions would you ask?", "What would make you fall in love?"], cta: "I'll help you see it through their eyes." },
];
const EDU_TIPS: Tip[] = [
  { hook: "What is earnest money?", points: ["A good-faith deposit with your offer", "Usually held by a neutral third party", "Rules and amounts vary by area"], cta: "Questions about offers? Ask me." },
  { hook: "What happens at an appraisal?", points: ["A licensed appraiser estimates value", "Lenders use it to protect the loan", "It can affect your financing"], cta: "I'll explain how it works for your deal." },
  { hook: "How does a home inspection work?", points: ["A professional checks major systems", "You get a written report", "It can lead to repair requests"], cta: "I can connect you with inspectors." },
  { hook: "What does 'under contract' mean?", points: ["An offer was accepted", "Contingencies still need to clear", "Closing comes after the remaining steps"], cta: "Curious about the timeline? Message me." },
  { hook: "What are closing costs?", points: ["Fees paid at the end of the transaction", "They vary by location and loan", "Your lender provides an estimate"], cta: "I'll help you plan for them." },
  { hook: "Buyer's market vs. seller's market", points: ["Supply and demand shape the leverage", "It changes by area and price point", "Strategy changes with it"], cta: "Want to know what's true where you live? Ask me." },
  { hook: "What is a contingency?", points: ["A condition that must be met to close", "Common: inspection, financing, appraisal", "They protect buyers (and shape deals)"], cta: "I'll explain how they apply to your offer." },
  { hook: "How long does buying a home take?", points: ["House hunting varies a lot", "Contract to close often takes weeks", "Preparation shortens the process"], cta: "Let's talk about your timeline." },
];
const LOCAL_PROMPTS = [
  "What's your favorite local coffee shop? ☕👇 I'm always looking for new spots to recommend to clients.",
  "Best park or trail around here? 🌳 Drop your favorite below — I'll add it to my list for people moving to the area.",
  "Where do you take out-of-town guests? 🍽️ Tell me your must-visit spot!",
  "What do you love most about living here? 💬 I'd love to hear what makes this community special.",
  "Favorite local small business? 🛍️ Let's give them a shout-out below.",
];

const pickTip = (bank: Tip[], v: number) => bank[((v % bank.length) + bank.length) % bank.length];
const slug = (s: string) => s.replace(/[^A-Za-z0-9]/g, "");
const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;

function baseTags(i: BuildInput): string[] {
  const city = i.property?.city ? `#${slug(i.property.city)}` : i.market ? `#${slug(i.market.split(",")[0].replace(/ County$/i, ""))}` : "";
  const bycat: Record<Category, string[]> = {
    just_listed: ["#JustListed", "#NewListing", "#HomesForSale"], open_house: ["#OpenHouse", "#HomesForSale", "#HouseHunting"],
    price_improvement: ["#PriceImprovement", "#HomesForSale"], just_sold: ["#JustSold", "#Sold", "#HappyHomeowners"],
    buyer_tip: ["#HomeBuyingTips", "#FirstTimeHomeBuyer", "#BuyerTips"], seller_tip: ["#HomeSellingTips", "#SellerTips", "#SellingYourHome"],
    education: ["#RealEstateEducation", "#HomeBuying", "#RealEstate101"], market_update: ["#MarketUpdate", "#RealEstateMarket"],
    local: ["#Community", "#ShopLocal", "#LocalFavorites"], personal_brand: ["#MeetYourRealtor", "#RealEstateAgent"],
  };
  return [...bycat[i.category], city, "#RealEstate"].filter(Boolean);
}

// ------------------------------------------------------------------ content per category
function core(i: BuildInput): { headline: string; lines: string[]; cta: string; slides: SocialSlide[] } {
  const v = i.variant ?? 0;
  const prop = i.property;
  const where = prop ? (prop.fullAddress || `${prop.address}${prop.city ? `, ${prop.city}` : ""}`) : "";
  const facts = prop?.facts ?? [];
  const details = prop?.details ?? [];
  const price = facts.find((f) => f.startsWith("$"));
  const specs = facts.filter((f) => !f.startsWith("$"));
  // the data every listing post carries: full address, price, beds/baths/size, and the extras we know
  const dataLines = prop ? [prop.fullAddress || where ? `📍 ${prop.fullAddress || where}` : "", price ? `💰 ${price}` : "", specs.length ? `🛏 ${specs.join(" • ")}` : "", details.length || prop.descriptors?.length ? `✨ ${[...(prop.descriptors ?? []), ...details].join(" • ")}` : ""].filter(Boolean) : [];
  // ONE stats image: price, beds/baths/size AND the extras (year built, lot, taxes…) together, so a post never needs a second stats slide.
  const tiles = (role: SocialSlide["role"] = "highlight"): SocialSlide[] => {
    const all = [...facts, ...details.slice(0, 3)];
    return all.length ? [slide(role, all.length >= 2 ? all.join(" • ") : all[0], prop?.placeLine || prop?.city || undefined)] : [];
  };
  const fullWhere = prop ? prop.fullAddress || [prop.address, [prop.city, [prop.state, prop.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ") : ""; // street + city + state + ZIP on every image
  const sig = i.contact?.trim() || i.name;
  const market = i.market ? i.market.replace(/,\s*[A-Z]{2}$/, "") : "";
  const slide = (role: SocialSlide["role"], headline: string, sub?: string): SocialSlide => ({ role, headline, sub, image_id: null });

  switch (i.category) {
    case "just_listed":
      return {
        headline: "Just Listed! 🏡", lines: dataLines.length ? dataLines : [where].filter(Boolean),
        cta: pick(v, ["Message me for details or a private showing.", "DM me to schedule a tour.", "Want to see it in person? Reach out."]),
        slides: [slide("hero", fullWhere || "New listing", price ? `Just Listed • ${price}` : "Just Listed"), ...(tiles().length ? tiles() : [slide("highlight", "Come see it in person", prop?.city ?? undefined)]), slide("cta", "Let's tour it", sig)],
      };
    case "open_house": {
      const when = i.when ? `${i.when.day} • ${i.when.range}` : "";
      return {
        headline: i.when ? `Open House this ${i.when.day}! 🏡` : "Open House! 🏡", lines: [...(when ? [`🗓 ${when}`] : []), ...dataLines].filter(Boolean),
        cta: pick(v, ["Stop by, take a look, and bring your questions.", "Come walk through — no appointment needed.", "I'd love to meet you there."]),
        slides: [slide("hero", fullWhere || "Open house", when ? `Open House • ${when}` : "Open House"), ...(tiles().length ? tiles() : [slide("highlight", "Come see it in person", prop?.city ?? undefined)]), slide("cta", i.when ? `Join me ${i.when.day}` : "Come say hello", i.when ? `${i.when.range} • ${fullWhere}`.trim() : sig)],
      };
    }
    case "price_improvement":
      return {
        headline: "Price Improvement! 🔔", lines: dataLines.length ? dataLines : [where].filter(Boolean),
        cta: pick(v, ["Now's a great time to take another look. Message me!", "Questions about the update? I'm happy to help."]),
        slides: [slide("hero", fullWhere || "Price improvement", price ? `New price • ${price}` : "Price Improvement"), ...(tiles().length ? tiles() : [slide("highlight", "Take another look", prop?.city ?? undefined)]), slide("cta", "Let's talk", sig)],
      };
    case "just_sold": {
      const who = i.client?.trim();
      return {
        headline: "Just Sold! 🎉", lines: dataLines.length ? dataLines : [where].filter(Boolean),
        cta: who ? `Congratulations to ${who}! So proud of this one. If you're thinking of selling, I'd love to help.` : pick(v, ["Congratulations to my wonderful clients! Thinking about your own move? Let's talk.", "So proud of this one. If you're thinking of selling, I'd love to help."]),
        // with a name: the big SOLD image plus a thank-you to them. Without one: just the one image
        slides: [slide("hero", "SOLD", [fullWhere || prop?.placeLine, price].filter(Boolean).join(" • ") || "Just sold"), ...(who ? [slide("cta", `Congratulations, ${who}!`, sig)] : [])],
      };
    }
    case "buyer_tip": case "seller_tip": case "education": {
      const bank = i.category === "buyer_tip" ? BUYER_TIPS : i.category === "seller_tip" ? SELLER_TIPS : EDU_TIPS;
      const emoji = i.category === "seller_tip" ? "🏷️" : i.category === "buyer_tip" ? "🔑" : "💡";
      if (i.tips && i.tips.n >= 2) {
        // "5 tips for first-time buyers": a real numbered list, one image per tip, so nothing is promised and left out
        const pool = [...bank.map((b) => b.hook), ...bank.flatMap((b) => b.points)].filter((x, k, a) => a.indexOf(x) === k);
        const picked = Array.from({ length: Math.min(i.tips.n, pool.length) }, (_, k) => pool[(v * 2 + k) % pool.length]).filter((x, k, a) => a.indexOf(x) === k);
        const title = `${picked.length} tips for ${i.tips.audience}`;
        return {
          headline: `${emoji} ${title}`, lines: picked.map((p, k) => `${k + 1}. ${p}`), cta: "Save this for later, and message me if you want help with any of it.",
          // a carousel is always three images: the cover, the whole list on one image, and who to call
          slides: [slide("hero", title, "Swipe →"), slide("highlight", picked.map((p, k) => `${k + 1}. ${p}`).join("\n"), "The list"), slide("cta", "Questions? Message me.", sig)],
        };
      }
      const t = pickTip(bank, v);
      return {
        headline: `${emoji} ${t.hook}`, lines: t.points.map((p) => `• ${p}`), cta: t.cta,
        slides: [slide("hero", t.hook, i.category === "buyer_tip" ? "Buyer tip" : i.category === "seller_tip" ? "Seller tip" : "How it works"), ...t.points.slice(0, 2).map((p, n) => slide("highlight", p, `${n + 1} of ${t.points.length}`)), slide("cta", t.cta, sig)],
      };
    }
    case "market_update":
      return {
        headline: `📊 Curious about the ${market || "local"} market?`, lines: ["Every neighborhood moves a little differently.", "Tell me your area and I'll share what I'm seeing."],
        cta: "Message me for a quick, no-pressure update.",
        slides: [slide("hero", `${market || "Your"} market`, "Market check-in"), slide("highlight", "What's your home worth today?", "Let's find out together"), slide("cta", "Message me", sig)],
      };
    case "local":
      return { headline: "💬 Let's hear from you!", lines: [pick(v, LOCAL_PROMPTS)], cta: "", slides: [slide("hero", "Local favorites", market || "Community"), slide("cta", "Share yours below", sig)] };
    case "personal_brand": {
      const who = [i.role && i.role !== "Agent" ? i.role : "real estate agent", i.brokerage ? `with ${i.brokerage}` : ""].filter(Boolean).join(" ");
      return {
        headline: `👋 Hi, I'm ${first(i.name)}!`, lines: [`I'm a ${who}${market ? ` helping people buy and sell in ${market}` : ""}.`, "Buying, selling, or just curious? I'm always happy to chat."],
        cta: "Send me a message — I'd love to meet you.",
        slides: [slide("hero", `Hi, I'm ${first(i.name)}`, market || undefined), slide("highlight", `Helping people buy & sell${market ? ` in ${market}` : ""}`, i.brokerage ?? undefined), slide("cta", "Let's connect", sig)],
      };
    }
  }
}
const pick = <T,>(v: number, a: T[]): T => a[((v % a.length) + a.length) % a.length];

// -------------------------------------------------------------------- platform shaping
/** A post carries at most this many hashtags (in the caption and in the tag list). */
export const MAX_HASHTAGS = 5;
/** Keeps the first `max` hashtags in a caption and drops the rest (whatever wrote them: templates, the AI, or the agent). */
export function capHashtags(text: string, max = MAX_HASHTAGS): string {
  let n = 0;
  return text.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, (m, lead) => (++n > max ? lead : m)).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trimEnd();
}
export function fitToPlatform(platform: SocialPlatform, body: string, tags: string[]): { caption: string; hashtags: string[] } {
  const limit = platformLimit(platform);
  const n = platform === "x" ? 2 : platform === "facebook" ? 2 : platform === "linkedin" ? 3 : platform === "tiktok" ? 4 : MAX_HASHTAGS;
  let hashtags = tags.slice(0, n);
  const tagLine = (t: string[]) => (t.length ? "\n\n" + t.join(" ") : "");
  if (platform === "x") {
    let text = body.replace(/\n{2,}/g, "\n").trim();
    while ((text + tagLine(hashtags)).length > limit && hashtags.length) hashtags = hashtags.slice(0, -1);
    const room = limit - tagLine(hashtags).length;
    if (text.length > room) text = text.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "") + "…";
    return { caption: capHashtags(text), hashtags };
  }
  const withTags = (platform === "instagram" || platform === "instagram_story" || platform === "tiktok" || platform === "linkedin") ? body + tagLine(hashtags) : body;
  if (withTags.length > limit) return { caption: capHashtags(withTags.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…"), hashtags };
  return { caption: capHashtags(withTags), hashtags };
}

/** A post is at most 3 images: the opener, one middle image, and the closing call to action. */
export const MAX_SLIDES = 3;
export const capSlides = (s: SocialSlide[]): SocialSlide[] => (s.length <= MAX_SLIDES ? s : [s[0], s[1], s[s.length - 1]]);

/** Build the final caption (hashtags included where the platform uses them inline), tags and slides. */
export function buildPost(i: BuildInput): Built {
  const c = core(i);
  const topic = i.topic?.trim();
  const body = [c.headline, ...(c.lines.length ? ["", ...c.lines] : []), ...(topic && !i.tips ? ["", topic] : []), ...(c.cta ? ["", c.cta] : [])].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const f = fitToPlatform(i.platform, body, baseTags(i));
  const carousel = PLATFORMS.find((p) => p.key === i.platform)?.carousel ?? true;
  return { caption: f.caption, hashtags: f.hashtags, slides: carousel ? capSlides(c.slides) : c.slides.slice(0, 1) };
}

export const variantCount = (cat: Category) => (cat === "buyer_tip" || cat === "seller_tip" ? 10 : cat === "education" ? 8 : cat === "local" ? 5 : 3);
