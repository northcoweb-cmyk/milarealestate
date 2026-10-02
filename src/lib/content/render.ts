import type { SocialPost, SocialSlide } from "../types";
import { FORMATS, formatFor, paletteOf, type Palette } from "./design";

/**
 * Draws post images in the browser (canvas → PNG): editorial layouts, six palettes, real property photos when
 * the agent has them. No server, no image-generation cost, and what you preview is exactly what you export.
 */
export interface Brand { name: string; brokerage?: string | null }
export interface RenderOpts { index: number; total: number; platform: string; brand: Brand; category?: string | null; width?: number }

type Ctx = CanvasRenderingContext2D;
let fonts: { serif: string; sans: string } | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const probe = (cls: string) => { const s = document.createElement("span"); s.className = cls; document.body.appendChild(s); const f = getComputedStyle(s).fontFamily; s.remove(); return f; };
  const serif = probe("display") || "Georgia, serif";
  const sans = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  try { await Promise.all([document.fonts.load(`400 80px ${serif}`), document.fonts.load(`500 30px ${sans}`), document.fonts.load(`700 30px ${sans}`)]); await document.fonts.ready; } catch { /* fall back to whatever is loaded */ }
  fonts = { serif, sans };
  return fonts;
}

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((res) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
  return imgCache.get(src)!;
}

// ---------------------------------------------------------------- helpers
function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + rr, y); c.arcTo(x + w, y, x + w, y + h, rr); c.arcTo(x + w, y + h, x, y + h, rr); c.arcTo(x, y + h, x, y, rr); c.arcTo(x, y, x + w, y, rr); c.closePath();
}
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
/** Wrap, then narrow the measure while the line count stays the same, so lines come out even (no lonely last word). */
function balanced(c: Ctx, text: string, maxW: number): string[] {
  const base = wrap(c, text, maxW); if (base.length < 2) return base;
  let best = base; for (let w = maxW; w > maxW * 0.55; w -= maxW * 0.03) { const l = wrap(c, text, w); if (l.length > base.length || l.some((x) => c.measureText(x).width > maxW)) break; best = l; }
  return best;
}
function wrap(c: Ctx, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
/** Largest font size (within [min,max]) at which the text fits the box; returns the wrapped lines. */
function fit(c: Ctx, text: string, font: (px: number) => string, maxW: number, maxH: number, max: number, min: number, lh: number, maxLines = 5) {
  for (let px = max; px >= min; px -= 4) {
    c.font = font(px); const lines = balanced(c, text, maxW);
    if (lines.length <= maxLines && lines.length * px * lh <= maxH && lines.every((l) => c.measureText(l).width <= maxW)) return { px, lines };
  }
  c.font = font(min); return { px: min, lines: balanced(c, text, maxW).slice(0, maxLines) };
}
function spaced(c: Ctx, text: string, x: number, y: number, track: number, align: "left" | "center" | "right" = "left") {
  const chars = [...text]; const widths = chars.map((ch) => c.measureText(ch).width + track); const total = widths.reduce((a, b) => a + b, 0) - track;
  let cx = align === "left" ? x : align === "center" ? x - total / 2 : x - total;
  chars.forEach((ch, i) => { c.fillText(ch, cx, y); cx += widths[i]; });
  return total;
}
const spacedWidth = (c: Ctx, text: string, track: number) => [...text].reduce((a, ch) => a + c.measureText(ch).width + track, -track);

function icon(c: Ctx, kind: string, x: number, y: number, size: number, color: string, alpha: number) {
  c.save(); c.translate(x, y); c.scale(size / 100, size / 100); c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = 3.2; c.lineJoin = "round"; c.lineCap = "round";
  const path = (d: string) => c.stroke(new Path2D(d));
  if (kind === "house") { path("M8 50 L50 14 L92 50"); path("M20 44 V88 H80 V44"); path("M42 88 V62 H58 V88"); }
  else if (kind === "key") { c.beginPath(); c.arc(30, 50, 17, 0, Math.PI * 2); c.stroke(); path("M47 50 H92"); path("M76 50 V64"); path("M88 50 V60"); }
  else if (kind === "tag") { path("M14 14 H52 L90 52 L52 90 L14 52 Z"); c.beginPath(); c.arc(31, 31, 5, 0, Math.PI * 2); c.stroke(); }
  else if (kind === "calendar") { path("M14 24 H86 V86 H14 Z"); path("M14 42 H86"); path("M34 12 V32"); path("M66 12 V32"); }
  else if (kind === "chat") { path("M12 18 H88 V68 H52 L30 88 V68 H12 Z"); }
  else if (kind === "chart") { path("M16 84 V54"); path("M40 84 V36"); path("M64 84 V60"); path("M88 84 V20"); path("M10 88 H94"); }
  else { path("M50 10 L61 38 L91 40 L68 59 L76 88 L50 72 L24 88 L32 59 L9 40 L39 38 Z"); }
  c.restore();
}
const ICON_FOR: Record<string, string> = { just_listed: "house", open_house: "calendar", price_improvement: "tag", just_sold: "key", buyer_tip: "key", seller_tip: "tag", education: "chat", market_update: "chart", local: "star", personal_brand: "star" };

interface Stat { value: string; label: string }
/** "$699,000 • 4 bd • 3 ba • 2,640 sqft" → big-number stats. Returns null when the text isn't a facts list. */
function parseStats(text: string): Stat[] | null {
  const parts = text.split(/\s*[•·|]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const out: Stat[] = [];
  for (const p of parts) {
    const m = p.match(/\$[\d,.]+\s?[kKmM]?|\d[\d,.]*/);
    if (!m) return null;
    const rest = p.replace(m[0], "").replace(/\b(offered|listed|priced)\s+at\b/i, "").replace(/[()]/g, "").trim();
    const label = m[0].startsWith("$") ? "Price" : /^(bd|bed|beds|bedrooms?)$/i.test(rest) ? "Beds" : /^(ba|bath|baths|bathrooms?)$/i.test(rest) ? "Baths" : /^sq\.?\s?ft\.?$/i.test(rest) ? "Sq ft" : rest.replace(/\b\w/g, (x) => x.toUpperCase());
    out.push({ value: m[0].trim(), label });
  }
  out.sort((a, b) => (a.label === "Price" ? -1 : b.label === "Price" ? 1 : 0));
  return out.slice(0, 4);
}

// ---------------------------------------------------------------- main renderer
export async function renderSlideCanvas(slide: SocialSlide, o: RenderOpts): Promise<HTMLCanvasElement> {
  const f = await loadFonts();
  const fmt = FORMATS[formatFor(o.platform)];
  const outW = o.width ?? fmt.w; const k = outW / fmt.w;
  const W = fmt.w, H = fmt.h;
  const cv = document.createElement("canvas"); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
  const c = cv.getContext("2d")!; c.scale(k, k);
  const u = Math.min(W / 1080, H / 1000); const m = 84 * u;
  const pal: Palette = paletteOf(slide.theme);
  const photo = slide.image_url ? await loadImage(slide.image_url) : null;
  const onPhoto = !!photo;
  const ink = onPhoto ? "#ffffff" : pal.ink, soft = onPhoto ? "rgba(255,255,255,.78)" : pal.soft;
  const serif = (px: number) => `400 ${px}px ${f.serif}`;
  const sans = (px: number, w = 500) => `${w} ${px}px ${f.sans}`;
  c.textBaseline = "alphabetic";

  // ---- background
  if (photo) {
    const s = Math.max(W / photo.width, H / photo.height); const w = photo.width * s, h = photo.height * s;
    c.drawImage(photo, (W - w) / 2, (H - h) / 2, w, h);
    const top = c.createLinearGradient(0, 0, 0, H * 0.3); top.addColorStop(0, "rgba(0,0,0,.5)"); top.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = top; c.fillRect(0, 0, W, H * 0.3);
    const bot = c.createLinearGradient(0, H * (slide.role === "cta" ? 0 : 0.38), 0, H); bot.addColorStop(0, `rgba(0,0,0,${slide.role === "cta" ? 0.55 : 0})`); bot.addColorStop(1, "rgba(0,0,0,.88)"); c.fillStyle = bot; c.fillRect(0, 0, W, H);
  } else {
    c.fillStyle = pal.bg; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W * 0.88, H * 0.06, 0, W * 0.88, H * 0.06, W * 1.0); g.addColorStop(0, pal.bg2); g.addColorStop(1, rgba(pal.bg2, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = pal.ink; c.lineWidth = 2 * u; c.globalAlpha = 0.07;
    for (const r of [360, 520, 700]) { c.beginPath(); c.arc(W * 0.92, H * 0.96, r * u, 0, Math.PI * 2); c.stroke(); }
    c.globalAlpha = 1;
    c.beginPath(); c.arc(W - m - 150 * u, m + 270 * u, 250 * u, 0, Math.PI * 2); c.fillStyle = pal.accent; c.globalAlpha = 0.07; c.fill(); c.globalAlpha = 1;
    icon(c, ICON_FOR[o.category ?? ""] ?? "star", W - m - 260 * u, m + 160 * u, 220 * u, pal.ink, 0.22);
  }

  // ---- top bar: index
  c.fillStyle = soft; c.font = sans(26 * u, 700);
  if (o.total > 1) spaced(c, `${String(o.index + 1).padStart(2, "0")} / ${String(o.total).padStart(2, "0")}`, W - m, m + 26 * u, 3 * u, "right");

  // ---- footer: brand + dots
  const footY = H - m;
  c.strokeStyle = onPhoto ? "rgba(255,255,255,.35)" : pal.ink; c.globalAlpha = onPhoto ? 1 : 0.18; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(m, footY - 74 * u); c.lineTo(W - m, footY - 74 * u); c.stroke(); c.globalAlpha = 1;
  c.fillStyle = ink; c.font = sans(32 * u, 700); c.fillText(o.brand.name, m, footY - 22 * u);
  if (o.brand.brokerage) { c.fillStyle = soft; c.font = sans(25 * u, 500); c.fillText(o.brand.brokerage, m, footY + 12 * u); }
  if (o.total > 1) for (let i = 0; i < o.total; i++) { const cx = W - m - (o.total - 1 - i) * 30 * u - 8 * u; c.beginPath(); c.arc(cx, footY - 20 * u, 8 * u, 0, Math.PI * 2); c.fillStyle = ink; c.globalAlpha = i === o.index ? 1 : 0.28; c.fill(); c.globalAlpha = 1; }

  const bodyBottom = Math.min(footY - 74 * u - 56 * u, formatFor(o.platform) === "story" ? H * 0.76 : H); // text block sits above the footer rule (higher on tall stories)
  const boxW = W - 2 * m;
  const pill = (text: string, x: number, y: number) => {
    c.font = sans(26 * u, 700); const tw = spacedWidth(c, text.toUpperCase(), 4 * u); const pw = tw + 48 * u, ph = 52 * u;
    rrect(c, x, y, pw, ph, ph / 2); c.fillStyle = onPhoto ? "rgba(255,255,255,.95)" : pal.accent; c.fill();
    c.fillStyle = onPhoto ? "#111" : pal.onAccent; spaced(c, text.toUpperCase(), x + 24 * u, y + 35 * u, 4 * u);
    return ph;
  };

  if (slide.role === "hero") {
    if (slide.sub) pill(slide.sub, m, m);
    const maxH = H * (onPhoto ? 0.36 : 0.5);
    const { px, lines } = fit(c, slide.headline, serif, boxW, maxH, 176 * u, 64 * u, 1.02, 4);
    const blockH = lines.length * px * 1.02;
    let y = bodyBottom - blockH + px * 0.86;
    c.fillStyle = pal.accent; if (!onPhoto) { c.fillRect(m, y - px * 0.86 - 44 * u, 96 * u, 6 * u); }
    c.fillStyle = ink; c.font = serif(px);
    for (const l of lines) { c.fillText(l, m, y); y += px * 1.02; }
  } else if (slide.role === "highlight") {
    const stats = parseStats(slide.headline);
    if (stats) {
      const cols = stats.length === 3 ? 3 : 2; const rows = Math.ceil(stats.length / cols);
      const cw = boxW / cols; const rowH = 250 * u; const gridH = rows * rowH;
      const top = onPhoto ? bodyBottom - gridH - 24 * u : H * 0.34;
      if (onPhoto) { rrect(c, m - 28 * u, top - 36 * u, boxW + 56 * u, gridH + 36 * u, 36 * u); c.fillStyle = "rgba(10,10,10,.55)"; c.fill(); }
      stats.forEach((s, i) => {
        const col = i % cols, row = Math.floor(i / cols); const x = m + col * cw, y = top + row * rowH;
        const { px } = fit(c, s.value, serif, cw - 64 * u, 140 * u, 138 * u, 64 * u, 1, 1);
        c.fillStyle = ink; c.font = serif(px); c.fillText(s.value, x, y + 110 * u);
        c.fillStyle = soft; c.font = sans(27 * u, 700); spaced(c, s.label.toUpperCase(), x, y + 162 * u, 4 * u);
        c.strokeStyle = onPhoto ? "rgba(255,255,255,.3)" : pal.ink; c.globalAlpha = onPhoto ? 1 : 0.2; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(x, y + 196 * u); c.lineTo(x + cw - 36 * u, y + 196 * u); c.stroke(); c.globalAlpha = 1;
      });
      if (slide.sub) { c.fillStyle = soft; c.font = sans(32 * u, 500); c.fillText(slide.sub, m, onPhoto ? top - 70 * u : top + gridH + 30 * u); }
    } else {
      const n = slide.sub?.match(/^(\d+)\s+of\s+(\d+)/i);
      const maxH = H * 0.42;
      const { px, lines } = fit(c, slide.headline, serif, boxW, maxH, 112 * u, 52 * u, 1.12, 6);
      let y = bodyBottom - lines.length * px * 1.12 + px * 0.9;
      if (n && !onPhoto) { c.fillStyle = pal.ink; c.globalAlpha = 0.1; c.font = serif(520 * u); c.fillText(n[1], m - 8 * u, y - px * 1.1 - 80 * u); c.globalAlpha = 1; }
      if (slide.sub) { c.fillStyle = soft; c.font = sans(27 * u, 700); spaced(c, (n ? `Tip ${n[1]} of ${n[2]}` : slide.sub).toUpperCase(), m, y - px * 1.1 - 28 * u, 4 * u); }
      c.fillStyle = ink; c.font = serif(px);
      for (const l of lines) { c.fillText(l, m, y); y += px * 1.12; }
    }
  } else {
    const maxH = H * 0.34;
    const { px, lines } = fit(c, slide.headline, serif, boxW, maxH, 150 * u, 64 * u, 1.04, 3);
    const blockH = lines.length * px * 1.04;
    const subH = slide.sub ? 120 * u : 0;
    let y = bodyBottom - subH - blockH + px * 0.86;
    c.fillStyle = ink; c.font = serif(px);
    for (const l of lines) { c.fillText(l, m, y); y += px * 1.04; }
    if (slide.sub) {
      c.font = sans(32 * u, 700); const tw = Math.min(c.measureText(slide.sub).width, boxW - 64 * u); const pw = tw + 64 * u, ph = 76 * u, py = bodyBottom - ph;
      rrect(c, m, py, pw, ph, ph / 2); c.fillStyle = onPhoto ? "#fff" : pal.accent; c.fill();
      c.fillStyle = onPhoto ? "#111" : pal.onAccent; c.fillText(slide.sub.length > 46 ? slide.sub.slice(0, 45) + "…" : slide.sub, m + 32 * u, py + 49 * u, boxW - 64 * u);
    }
  }
  return cv;
}

export const toBlob = (cv: HTMLCanvasElement, type = "image/png") => new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't render the image."))), type));

// ---------------------------------------------------------------- preview cache + queue
const urlCache = new Map<string, string>();
let chain: Promise<unknown> = Promise.resolve();
const slideKey = (s: SocialSlide, o: RenderOpts) => JSON.stringify([s.role, s.headline, s.sub, s.image_url, s.theme, o.index, o.total, o.platform, o.brand, o.category, o.width]);

/** Small preview image (object URL). Renders one at a time so the page stays smooth. */
export function previewUrl(slide: SocialSlide, o: RenderOpts): Promise<string> {
  const key = slideKey(slide, o);
  const hit = urlCache.get(key); if (hit) return Promise.resolve(hit);
  const job = chain.then(async () => { const cv = await renderSlideCanvas(slide, { ...o, width: o.width ?? 540 }); const url = URL.createObjectURL(await toBlob(cv, "image/jpeg")); urlCache.set(key, url); return url; });
  chain = job.catch(() => undefined);
  return job;
}

// ---------------------------------------------------------------- export
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "post";
export async function renderPostFiles(post: SocialPost, brand: Brand): Promise<File[]> {
  const out: File[] = [];
  for (let i = 0; i < post.slides.length; i++) {
    const cv = await renderSlideCanvas(post.slides[i], { index: i, total: post.slides.length, platform: post.platform, brand, category: post.category });
    out.push(new File([await toBlob(cv)], `${post.platform}-${slug(post.category ?? "post")}-${i + 1}.png`, { type: "image/png" }));
  }
  return out;
}

/** Share to the phone's share sheet (Photos, Instagram, Messages…); falls back to downloading. */
export async function shareOrDownload(files: File[], caption: string): Promise<"shared" | "downloaded" | "cancelled"> {
  try { await navigator.clipboard?.writeText(caption); } catch { /* clipboard may be blocked */ }
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (files.length && nav.canShare?.({ files })) {
    try { await navigator.share({ files, text: caption }); return "shared"; }
    catch (e) { if ((e as Error).name === "AbortError") return "cancelled"; }
  }
  for (const f of files) downloadBlob(f, f.name);
  return "downloaded";
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 8000);
}
