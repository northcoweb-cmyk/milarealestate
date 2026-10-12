import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Search engines AND AI answer engines are welcome: being named in their answers is the goal.
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot"];
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }, ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: "/api/" }))], sitemap: `${SITE}/sitemap.xml`, host: SITE };
}
