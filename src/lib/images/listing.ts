import { createHash, randomUUID } from "node:crypto";
import type { Store } from "../db/store";
import { putFile } from "../files";
import type { Property } from "../types";
import { FetchBlocked, robotsAllows, safeFetch } from "./safe-fetch";

/**
 * Pull photos from a listing page the agent gave us — the same public metadata a link preview
 * reads (og:image, twitter:image, JSON-LD "image"). We do NOT crawl galleries, log in, run
 * scripts or bypass blocks: robots.txt is honoured, and a site that refuses automated access
 * is reported honestly so the agent can use another link or upload photos (last resort).
 */

export const PORTALS = /(^|\.)(zillow|redfin|realtor|trulia|homes|movoto|apartments|rent|hotpads|loopnet|crexi|streeteasy)\.(com|net)$/i;

export interface ListingExtract { images: string[]; address?: { street?: string; city?: string; state?: string; zip?: string } }

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

export function extractFromHtml(html: string, baseUrl: string): ListingExtract {
  const found: string[] = [];
  const add = (u: unknown) => {
    if (typeof u !== "string" || !u.trim()) return;
    try {
      const abs = new URL(decode(u), baseUrl);
      if (!/^https?:$/.test(abs.protocol)) return;
      if (/\.(svg|ico)(\?|$)|logo|favicon|sprite|placeholder|avatar|pixel|1x1/i.test(abs.pathname)) return;
      found.push(abs.toString());
    } catch { /* ignore bad URL */ }
  };
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const prio = ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"];
  for (const key of prio) for (const m of metas) {
    const k = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(m)?.[1]?.toLowerCase();
    if (k === key) add(/content\s*=\s*["']([^"']+)["']/i.exec(m)?.[1]);
  }
  for (const l of html.match(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/gi) ?? []) add(/href\s*=\s*["']([^"']+)["']/i.exec(l)?.[1]);

  let address: ListingExtract["address"];
  for (const block of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(block[1]); } catch { continue; }
    const walk = (n: unknown, depth = 0) => {
      if (!n || depth > 6) return;
      if (Array.isArray(n)) { n.forEach((x) => walk(x, depth + 1)); return; }
      if (typeof n !== "object") return;
      const o = n as Record<string, any>;
      const t = [o["@type"]].flat().join(",");
      if (/Residence|House|Apartment|SingleFamilyResidence|RealEstateListing|Product|Offer|Place|Accommodation|WebPage/i.test(t) || o.image) {
        const im = o.image; [im].flat().forEach((x) => add(typeof x === "string" ? x : x?.url ?? x?.contentUrl));
        const ph = o.photo; [ph].flat().forEach((x) => add(typeof x === "string" ? x : x?.url ?? x?.contentUrl));
      }
      const ad = o.address;
      if (ad && typeof ad === "object" && !address) address = { street: ad.streetAddress, city: ad.addressLocality, state: ad.addressRegion, zip: ad.postalCode };
      for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, depth + 1);
    };
    walk(data);
  }
  return { images: [...new Set(found)], address };
}

export interface PullResult { added: number; host: string; reason?: "blocked" | "robots" | "none" | "error" | "bad_link"; detail?: string; filledCity?: boolean }

const IMG_TYPES = /^image\/(jpeg|png|webp|gif)$/;

export async function pullListingPhotos(store: Store, userId: string, property: Property, url: string, max = 6): Promise<PullResult> {
  let u: URL;
  try { u = new URL(url); } catch { return { added: 0, host: "", reason: "bad_link", detail: "That doesn't look like a web link." }; }
  const host = u.hostname.replace(/^www\./, "");
  // Big listing portals forbid automated access in their terms; never touch them, whatever their robots.txt says.
  if (PORTALS.test(host)) return { added: 0, host, reason: "robots", detail: `${host} doesn't allow automated access.` };
  try {
    // robots.txt first
    try {
      const rb = await safeFetch(new URL("/robots.txt", u).toString(), { maxBytes: 200_000, timeoutMs: 5000, accept: "text/plain" });
      if ([401, 403].includes(rb.status) || (rb.status === 200 && !robotsAllows(rb.body.toString("utf8"), u.pathname + u.search))) return { added: 0, host, reason: "robots", detail: `${host} doesn't allow automated access.` };
    } catch (e) { if (e instanceof FetchBlocked && e.reason === "ssrf") throw e; /* no robots.txt reachable: proceed politely */ }

    const page = await safeFetch(u.toString(), { maxBytes: 2_000_000, timeoutMs: 9000, accept: "text/html,application/xhtml+xml" });
    if ([401, 403, 429, 451, 503].includes(page.status) || /captcha|are you a robot|access denied|unusual traffic/i.test(page.body.toString("utf8", 0, 6000))) return { added: 0, host, reason: "blocked", detail: `${host} doesn't allow automatic access.` };
    if (page.status >= 400) return { added: 0, host, reason: "error", detail: `${host} returned an error (${page.status}).` };
    if (!/html|xml/.test(page.contentType)) return { added: 0, host, reason: "none", detail: "That link isn't a web page." };

    const ex = extractFromHtml(page.body.toString("utf8"), page.finalUrl);
    // fill missing location from the listing's own structured data, only if the street number matches our address
    let filledCity = false;
    const num = property.address.match(/^\d+/)?.[0];
    if (ex.address?.street && num && ex.address.street.includes(num) && !property.city && ex.address.city) {
      await store.update("properties", userId, property.id, { city: ex.address.city ?? null, state: ex.address.state ?? property.state, zip: ex.address.zip ?? property.zip } as Partial<Property>);
      filledCity = true;
    }

    const existing = (await store.list("documents", userId)).filter((d) => d.property_id === property.id);
    const seen = new Set(existing.map((d) => (d.extracted as { sha?: string } | null)?.sha).filter(Boolean));
    let pos = (await store.list("property_images", userId)).filter((i) => i.property_id === property.id).length;
    let added = 0;
    for (const img of ex.images.slice(0, max * 2)) {
      if (added >= max) break;
      try {
        const r = await safeFetch(img, { maxBytes: 6_000_000, timeoutMs: 9000, accept: "image/*" });
        if (r.status !== 200 || !IMG_TYPES.test(r.contentType) || r.body.length < 15_000) continue; // skip icons/tracking pixels
        const sha = createHash("sha256").update(r.body).digest("hex");
        if (seen.has(sha)) continue;
        seen.add(sha);
        const id = randomUUID();
        const ext = r.contentType.split("/")[1].replace("jpeg", "jpg");
        const path = await putFile(userId, id, r.body, r.contentType);
        await store.insert("documents", userId, { id, name: `${property.address} (listing photo ${pos + 1}).${ext}`, kind: "image", mime: r.contentType, size_bytes: r.body.length, storage_path: path, text_content: null, extracted: { sha, from: host }, property_id: property.id, contact_id: null, summary: `From ${host}` } as never);
        await store.insert("property_images", userId, { property_id: property.id, document_id: id, url: `/api/files/${id}`, caption: `From ${host}`, position: pos++, source: "listing" });
        added++;
      } catch { /* skip an image that can't be fetched */ }
    }
    if (property.listing_url !== u.toString()) await store.update("properties", userId, property.id, { listing_url: u.toString() } as Partial<Property>);
    return added ? { added, host, filledCity } : { added: 0, host, reason: "none", detail: `I found the page but it doesn't share any photos I can use.`, filledCity };
  } catch (e) {
    if (e instanceof FetchBlocked) return { added: 0, host, reason: e.reason === "ssrf" ? "bad_link" : e.reason === "robots" ? "robots" : "error", detail: e.message };
    return { added: 0, host, reason: "error", detail: "Something went wrong reading that page." };
  }
}

