import { NextResponse } from "next/server";
import { addCreatorVideo, creatorByToken, creatorVideos, videosWithUrl } from "@/lib/sb";

const hits = new Map<string, number[]>();
const limited = (ip: string) => { const now = Date.now(), l = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000); l.push(now); hits.set(ip, l); if (hits.size > 3000) hits.clear(); return l.length > 20; };
const HOSTS = /^(?:www\.|m\.|vm\.|vt\.)?(?:tiktok\.com|instagram\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch|x\.com|twitter\.com|linkedin\.com)$/i;

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "x").split(",")[0].trim();
  if (limited(ip)) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { token?: string; url?: string; replace?: string };
  const c = await creatorByToken(String(b.token ?? ""));
  if (!c) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  if (!["active", "partner", "paused"].includes(c.status)) return NextResponse.json({ error: c.status === "rewarded" ? "You're all done with this round. Thank you!" : "Your creator window isn't open. Ask us to reopen it." }, { status: 403 });
  let u: URL;
  try { u = new URL(String(b.url ?? "").trim()); } catch { return NextResponse.json({ error: "Paste the full link to your video." }, { status: 400 }); }
  if (u.protocol !== "https:" || !HOSTS.test(u.hostname)) return NextResponse.json({ error: "Use the link from TikTok, Instagram or YouTube (it starts with https://)." }, { status: 400 });
  const url = `${u.origin}${u.pathname}${u.search}`.slice(0, 300);
  const existing = await creatorVideos(c.id);
  if (existing.some((v) => v.url === url)) return NextResponse.json({ error: "That link is already in." }, { status: 409 });
  if (!b.replace && existing.filter((v) => v.status !== "rejected").length >= 6) return NextResponse.json({ error: "You've sent plenty. We'll check them and be in touch." }, { status: 400 });
  const platform = /tiktok/i.test(u.hostname) ? "tiktok" : /instagram/i.test(u.hostname) ? "instagram" : /youtu/i.test(u.hostname) ? "youtube" : "other";
  // automatic warnings Sarah sees next to the video: the same link sent by someone else, or an account that isn't theirs
  const flags: string[] = [];
  if ((await videosWithUrl(url)).some((x) => x.creator_id !== c.id)) flags.push("duplicate_other");
  const m = /\/@([\w.-]+)/.exec(u.pathname);
  if (m && c.handle && !/^(?:youtu\.?be)/i.test(u.hostname) && m[1].toLowerCase() !== c.handle.replace(/^@/, "").toLowerCase()) flags.push("handle_mismatch");
  if (c.platform && c.platform !== "other" && platform !== "other" && c.platform !== platform) flags.push("platform_mismatch");
  try { await addCreatorVideo(c.id, url, platform, b.replace ? String(b.replace) : undefined, { kind: c.status === "active" ? "trial" : "partner", flags }); } catch (e) { console.error("[creators/submit]", e instanceof Error ? e.message : e); return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
