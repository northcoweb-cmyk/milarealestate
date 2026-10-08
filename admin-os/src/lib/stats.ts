// Reads the public numbers (views, likes, comments, shares) from a post link on X, TikTok or Instagram. No logins or API keys: it only reads what a signed-out visitor can see.
export interface Stats { views: number | null; likes: number | null; comments: number | null; shares: number | null }

const HOSTS: Record<string, string[]> = {
  x: ["x.com", "twitter.com", "mobile.twitter.com", "www.x.com", "www.twitter.com"],
  tiktok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"],
  instagram: ["instagram.com", "www.instagram.com"],
};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Only these hosts are ever fetched, so a pasted link can never make the server call something internal. */
export function linkMatches(platform: string, link: string): boolean {
  try { const u = new URL(link); return u.protocol === "https:" && (HOSTS[platform] ?? []).includes(u.hostname.toLowerCase()); } catch { return false; }
}

/** "5,094", "12.3K", "1.2M" → number. */
export function toNum(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.trim().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([kKmMbB])?$/);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Math.round(parseFloat(m[1]) * mult);
}

async function get(url: string, accept = "text/html"): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept, "accept-language": "en-US,en;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(9000), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.text()).slice(0, 3_000_000);
  } catch { return null; }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const has = (s: Stats) => s.views !== null || s.likes !== null || s.comments !== null || s.shares !== null;

export function parseTikTok(html: string): Stats | null {
  const m = html.match(/"stats":\{[^}]*"playCount":\d+[^}]*\}/) ?? html.match(/"stats":\{[^}]*"diggCount":\d+[^}]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0].slice(m[0].indexOf("{"))) as Record<string, unknown>;
    const s = { views: num(o.playCount), likes: num(o.diggCount), comments: num(o.commentCount), shares: num(o.shareCount) };
    return has(s) ? s : null;
  } catch { return null; }
}

export function parseInstagram(html: string): Stats | null {
  const desc = html.match(/og:description"\s+content="([^"]*)"/i)?.[1] ?? html.match(/content="([^"]*)"\s+property="og:description"/i)?.[1] ?? "";
  const pick = (re: RegExp) => toNum(desc.match(re)?.[1]);
  const views = toNum(html.match(/video_view_count\\?":\s*(\d+)/)?.[1]) ?? toNum(html.match(/video_play_count\\?":\s*(\d+)/)?.[1]) ?? pick(/([\d.,]+[KMkm]?)\s+(?:views|plays)/);
  const s = { views, likes: pick(/([\d.,]+[KMkm]?)\s+likes/i), comments: pick(/([\d.,]+[KMkm]?)\s+comments/i), shares: null };
  return has(s) ? s : null;
}

export async function fetchStats(platform: string, link: string): Promise<Stats | null> {
  if (!linkMatches(platform, link)) return null;
  if (platform === "x") {
    const u = new URL(link); const m = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!m) return null;
    const raw = await get(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`, "application/json");
    if (!raw) return null;
    try { const t = (JSON.parse(raw) as { tweet?: Record<string, unknown> }).tweet; if (!t) return null; const s = { views: num(t.views), likes: num(t.likes), comments: num(t.replies), shares: num(t.retweets) }; return has(s) ? s : null; } catch { return null; }
  }
  const html = await get(link);
  if (!html) return null;
  if (platform === "tiktok") return parseTikTok(html);
  if (platform === "instagram") {
    const s = parseInstagram(html);
    if (s && s.views === null) { // reels: the embed page carries the play count
      const m = new URL(link).pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)/);
      const emb = m ? await get(`https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/embed/captioned/`) : null;
      const v = toNum(emb?.match(/video_view_count\\?":\s*(\d+)/)?.[1]);
      if (v !== null) s.views = v;
    }
    return s;
  }
  return null;
}
