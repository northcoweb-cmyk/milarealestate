import type { SocialPost, SocialSlide } from "../types";
import { FORMATS, formatFor, layoutOf, paletteOf, type Palette } from "./design";

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

type Shape = "round" | "arch" | "circle" | "sharp";
function shapePath(c: Ctx, shape: Shape, x: number, y: number, w: number, h: number, r = 44) {
  if (shape === "round") { rrect(c, x, y, w, h, r); return; }
  c.beginPath();
  if (shape === "circle") c.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  else if (shape === "sharp") c.rect(x, y, w, h);
  else { const a = w / 2, b = 36; c.moveTo(x, y + h - b); c.lineTo(x, y + a); c.arc(x + a, y + a, a, Math.PI, 0); c.lineTo(x + w, y + h - b); c.arcTo(x + w, y + h, x + w - b, y + h, b); c.lineTo(x + b, y + h); c.arcTo(x, y + h, x, y + h - b, b); c.closePath(); }
}

interface Art { ink: string; accent: string; soft: string; bg: string; panel: string; onAccent: string }
const sparkle = (c: Ctx, x: number, y: number, r: number, col: string) => { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill(); };

/** Draws a 400x300 scene into the rect, scaled to fit and centred. */
function illustrate(c: Ctx, kind: string, x: number, y: number, w: number, h: number, a: Art, initials: string, sans: string, shape: Shape = "round") {
  c.save(); shapePath(c, shape, x, y, w, h); c.clip();
  c.fillStyle = a.panel; c.fillRect(x, y, w, h);
  const k = Math.min(w / 400, h / 300) * 0.92; c.translate(x + (w - 400 * k) / 2, y + (h - 300 * k) / 2 + 6 * k); c.scale(k, k);
  const fill = (col: string, al = 1) => { c.fillStyle = col; c.globalAlpha = al; };
  const rect = (rx: number, ry: number, rw: number, rh: number, r = 0) => { rrect(c, rx, ry, rw, rh, r); c.fill(); };
  const circle = (cx: number, cy: number, r: number) => { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); };
  const reset = () => { c.globalAlpha = 1; };
  // shared sky: sun + soft hills
  const backdrop = (sun = true) => { if (sun) { fill(a.soft, 0.35); circle(318, 74, 40); } fill(a.soft, 0.22); c.beginPath(); c.ellipse(90, 262, 190, 70, 0, Math.PI, 0); c.fill(); c.beginPath(); c.ellipse(330, 268, 170, 56, 0, Math.PI, 0); c.fill(); reset(); sparkle(c, 70, 70, 14, a.accent); sparkle(c, 360, 150, 9, a.accent); };
  if (kind === "house" || kind === "calendar") {
    backdrop();
    fill(a.accent); rect(112, 132, 176, 122, 8);                       // body
    fill(a.soft); c.beginPath(); c.moveTo(92, 140); c.lineTo(200, 52); c.lineTo(308, 140); c.closePath(); c.fill(); // roof
    fill(a.accent); rect(250, 70, 24, 52, 4);                          // chimney
    fill(a.panel); c.beginPath(); c.moveTo(178, 254); c.lineTo(178, 196); c.arc(200, 196, 22, Math.PI, 0); c.lineTo(222, 254); c.closePath(); c.fill(); // arched door
    fill(a.panel); rect(128, 160, 34, 34, 6); rect(238, 160, 34, 34, 6);
    fill(a.soft); rect(143, 160, 4, 34); rect(253, 160, 4, 34);
    fill(a.soft, 0.7); circle(56, 206, 32); rect(52, 226, 8, 28, 3); circle(352, 222, 24); rect(348, 238, 8, 16, 3);
    fill(a.accent, 0.6); rect(0, 252, 400, 6);
    if (kind === "calendar") { fill(a.onAccent); rect(0, 0, 0, 0); fill(a.accent); rect(262, 168, 98, 92, 14); fill(a.panel); rect(262, 168, 98, 26, 14); rect(262, 182, 98, 12); fill(a.accent); c.font = `800 38px ${sans}`; c.textAlign = "center"; c.fillStyle = a.panel; fill(a.panel); c.fillText("OPEN", 311, 235); c.textAlign = "left"; }
  } else if (kind === "key") {
    backdrop(false);
    c.save(); c.translate(200, 150); c.rotate(-0.5);
    c.strokeStyle = a.accent; c.lineWidth = 26; c.beginPath(); c.arc(-78, 0, 50, 0, Math.PI * 2); c.stroke();
    fill(a.accent); rect(-30, -13, 190, 26, 13); rect(98, 8, 24, 44, 6); rect(132, 8, 24, 32, 6);
    fill(a.soft); circle(-78, 0, 16);
    c.restore(); reset();
    fill(a.accent, 0.5); sparkle(c, 330, 70, 18, a.accent); sparkle(c, 60, 230, 12, a.soft);
  } else if (kind === "tag") {
    backdrop();
    c.save(); c.translate(200, 150); c.rotate(-0.25);
    fill(a.accent); c.beginPath(); c.moveTo(-110, -70); c.lineTo(40, -70); c.lineTo(120, 0); c.lineTo(40, 70); c.lineTo(-110, 70); c.closePath(); c.fill();
    fill(a.panel); circle(-78, 0, 14);
    c.fillStyle = a.panel; c.font = `800 92px ${sans}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("$", -4, 4); c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.restore(); reset();
    fill(a.soft); c.beginPath(); c.moveTo(300, 190); c.lineTo(340, 190); c.lineTo(340, 232); c.lineTo(354, 232); c.lineTo(320, 268); c.lineTo(286, 232); c.lineTo(300, 232); c.closePath(); c.fill(); reset();
  } else if (kind === "sign") {
    backdrop();
    fill(a.soft); rect(194, 160, 12, 100, 3);
    fill(a.accent); rect(62, 54, 276, 130, 14);
    fill(a.panel); rect(76, 68, 248, 102, 8);
    c.fillStyle = a.accent; c.font = `800 82px ${sans}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("SOLD", 200, 122); c.textAlign = "left"; c.textBaseline = "alphabetic";
    fill(a.accent, 0.6); rect(0, 252, 400, 6);
    for (const [cx, cy, r] of [[50, 40, 7], [350, 40, 6], [372, 120, 8], [28, 130, 6], [330, 232, 7], [70, 225, 6]]) { fill(a.accent, 0.8); circle(cx, cy, r); } reset();
  } else if (kind === "chart") {
    backdrop();
    const bars = [70, 110, 90, 150, 190];
    bars.forEach((bh, n) => { fill(n === 4 ? a.accent : a.soft, n === 4 ? 1 : 0.7); rect(70 + n * 54, 250 - bh, 38, bh, 8); });
    c.strokeStyle = a.accent; c.lineWidth = 7; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath(); c.moveTo(78, 150); c.lineTo(132, 112); c.lineTo(186, 128); c.lineTo(240, 78); c.lineTo(310, 42); c.stroke();
    fill(a.accent); c.beginPath(); c.moveTo(322, 30); c.lineTo(298, 34); c.lineTo(314, 58); c.closePath(); c.fill(); reset();
    fill(a.accent, 0.6); rect(50, 252, 300, 6);
  } else if (kind === "chat") {
    backdrop();
    fill(a.accent); rect(60, 70, 190, 100, 26); c.beginPath(); c.moveTo(90, 166); c.lineTo(86, 206); c.lineTo(130, 168); c.closePath(); c.fill();
    fill(a.panel); circle(112, 120, 11); circle(155, 120, 11); circle(198, 120, 11);
    fill(a.soft); rect(150, 150, 190, 90, 26); c.beginPath(); c.moveTo(310, 236); c.lineTo(318, 270); c.lineTo(276, 238); c.closePath(); c.fill();
    fill(a.panel); rect(176, 178, 110, 10, 5); rect(176, 202, 70, 10, 5); reset();
  } else { // monogram
    backdrop();
    c.strokeStyle = a.accent; c.lineWidth = 6; c.setLineDash([2, 18]); c.lineCap = "round"; c.beginPath(); c.arc(200, 140, 118, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    fill(a.accent); circle(200, 140, 92);
    c.fillStyle = a.panel; c.font = `800 92px ${sans}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(initials, 200, 146); c.textAlign = "left"; c.textBaseline = "alphabetic";
    reset(); sparkle(c, 330, 60, 20, a.accent); sparkle(c, 66, 220, 14, a.soft);
  }
  c.restore();
}
const ART_FOR: Record<string, string> = { just_listed: "house", open_house: "calendar", price_improvement: "tag", just_sold: "sign", buyer_tip: "key", seller_tip: "tag", education: "chat", market_update: "chart", local: "chat", personal_brand: "monogram" };
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "M";
const KICKER: Record<string, string> = { just_listed: "Just listed", open_house: "Open house", price_improvement: "Price improvement", just_sold: "Just sold", buyer_tip: "Buyer tip", seller_tip: "Seller tip", education: "How it works", market_update: "Market check-in", local: "Local favorites", personal_brand: "Meet your agent" };

// ---------------------------------------------------------------- main renderer
export async function renderSlideCanvas(slide: SocialSlide, o: RenderOpts): Promise<HTMLCanvasElement> {
  const f = await loadFonts();
  const format = formatFor(o.platform);
  const fmt = FORMATS[format];
  const outW = o.width ?? fmt.w; const k = outW / fmt.w;
  const W = fmt.w, H = fmt.h;
  const cv = document.createElement("canvas"); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
  const c = cv.getContext("2d")!; c.scale(k, k);
  const u = Math.min(W / 1080, H / 1000); const m = 78 * u;
  const pal: Palette = paletteOf(slide.theme);
  const photo = slide.image_url ? await loadImage(slide.image_url) : null;
  const landscape = format === "landscape";
  let lay = layoutOf(slide.layout).key;
  if (lay === "cinema" && !photo) lay = "panel";
  const fullBleed = lay === "cinema" && !!photo;
  const ink = fullBleed ? "#ffffff" : pal.ink, soft = fullBleed ? "rgba(255,255,255,.8)" : pal.soft;
  const poster = lay === "poster";
  const headSerif = pal.serif && !poster;
  const head = (px: number) => (headSerif ? `400 ${px}px ${f.serif}` : `800 ${px}px ${f.sans}`);
  const sans = (px: number, w = 500) => `${w} ${px}px ${f.sans}`;
  const tight = (px: number) => { try { (c as unknown as { letterSpacing: string }).letterSpacing = headSerif ? "0px" : `${(-0.025 * px).toFixed(2)}px`; } catch { /* unsupported */ } };
  const loose = () => { try { (c as unknown as { letterSpacing: string }).letterSpacing = "0px"; } catch { /* ignore */ } };
  const lhOf = headSerif ? 1.04 : poster ? 0.92 : 1.02;
  const art: Art = { ink: pal.ink, accent: pal.accent, soft: pal.soft, bg: pal.bg, panel: pal.bg2, onAccent: pal.onAccent };
  const kind = ART_FOR[o.category ?? ""] ?? "monogram";
  const ini = initialsOf(o.brand.name);
  const kickerText = slide.role === "hero" && slide.sub ? slide.sub : KICKER[o.category ?? ""] ?? "";
  const centered = !landscape && (lay === "arch" || lay === "badge" || lay === "ticket" || lay === "polaroid");
  const tileR = lay === "poster" || lay === "split" ? 10 * u : lay === "arch" || lay === "badge" ? 60 * u : 40 * u;
  const stripShape: Shape = lay === "poster" || lay === "split" ? "sharp" : "round";
  const HL = poster ? slide.headline.toUpperCase() : slide.headline;
  c.textBaseline = "alphabetic";

  // ---- background (+ per-layout decoration)
  if (fullBleed && photo) {
    const s = Math.max(W / photo.width, H / photo.height); const w = photo.width * s, h = photo.height * s;
    c.drawImage(photo, (W - w) / 2, (H - h) / 2, w, h);
    const top = c.createLinearGradient(0, 0, 0, H * 0.3); top.addColorStop(0, "rgba(0,0,0,.5)"); top.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = top; c.fillRect(0, 0, W, H * 0.3);
    const bot = c.createLinearGradient(0, H * (slide.role === "cta" ? 0 : 0.38), 0, H); bot.addColorStop(0, `rgba(0,0,0,${slide.role === "cta" ? 0.55 : 0})`); bot.addColorStop(1, "rgba(0,0,0,.88)"); c.fillStyle = bot; c.fillRect(0, 0, W, H);
  } else {
    c.fillStyle = lay === "polaroid" ? pal.bg2 : pal.bg; c.fillRect(0, 0, W, H);
    c.save();
    if (lay === "poster") { c.fillStyle = pal.accent; c.globalAlpha = 0.12; c.beginPath(); c.moveTo(0, H * 0.58); c.lineTo(W, H * 0.46); c.lineTo(W, H * 0.8); c.lineTo(0, H * 0.92); c.closePath(); c.fill(); }
    else if (lay === "arch") { c.strokeStyle = pal.ink; c.globalAlpha = 0.07; c.lineWidth = 3 * u; for (const r of [420, 560, 700]) { c.beginPath(); c.arc(W / 2, H * 0.34, r * u, Math.PI, 0); c.stroke(); } }
    else if (lay === "badge") { c.strokeStyle = pal.ink; c.globalAlpha = 0.07; c.lineWidth = 3 * u; for (const r of [380, 540, 700, 860]) { c.beginPath(); c.arc(W / 2, H * 0.3, r * u, 0, Math.PI * 2); c.stroke(); } }
    else if (lay === "stack") { c.strokeStyle = pal.ink; c.globalAlpha = 0.05; c.lineWidth = 2 * u; for (let x = -H; x < W + H; x += 46 * u) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + H * 0.6, H); c.stroke(); } }
    else if (lay === "panel") { c.fillStyle = pal.bg2; c.globalAlpha = 0.35; c.beginPath(); c.arc(W, H, 520 * u, 0, Math.PI * 2); c.fill(); }
    else if (lay === "split") { c.fillStyle = pal.bg2; c.globalAlpha = 0.5; c.fillRect(0, 0, W, H * 0.52); }
    c.restore();
  }

  // ---- shared pieces
  c.fillStyle = soft; c.font = sans(25 * u, 700);
  const counterOnMedia = lay === "split" && slide.role === "hero" && !landscape;
  if (o.total > 1) { c.fillStyle = counterOnMedia && photo ? "#fff" : soft; spaced(c, `${String(o.index + 1).padStart(2, "0")} / ${String(o.total).padStart(2, "0")}`, W - m, m + 24 * u, 3 * u, "right"); }
  const footY = H - m;
  const mono = 58 * u;
  c.beginPath(); c.arc(m + mono / 2, footY - 22 * u, mono / 2, 0, Math.PI * 2); c.fillStyle = fullBleed ? "#fff" : pal.accent; c.fill();
  c.fillStyle = fullBleed ? "#111" : pal.onAccent; c.font = sans(22 * u, 800); c.textAlign = "center"; c.fillText(ini, m + mono / 2, footY - 22 * u + 8 * u); c.textAlign = "left";
  const bx = m + mono + 22 * u;
  c.fillStyle = ink; c.font = sans(30 * u, 800); c.fillText(o.brand.name, bx, footY - 24 * u);
  if (o.brand.brokerage) { c.fillStyle = soft; c.font = sans(24 * u, 500); c.fillText(o.brand.brokerage, bx, footY + 8 * u); }
  if (o.total > 1) for (let i = 0; i < o.total; i++) { const cx = W - m - (o.total - 1 - i) * 30 * u - 8 * u; c.beginPath(); c.arc(cx, footY - 22 * u, 8 * u, 0, Math.PI * 2); c.fillStyle = ink; c.globalAlpha = i === o.index ? 1 : 0.28; c.fill(); c.globalAlpha = 1; }
  // "swipe" cue on the first slide of a carousel
  const swipeCue = slide.role === "hero" && o.total > 1 && !landscape;

  const contentBottom = footY - 100 * u;
  const boxW = W - 2 * m;
  const mediaBox = (x: number, y: number, w: number, h: number, shape: Shape) => {
    if (photo && !fullBleed) {
      c.save(); shapePath(c, shape, x, y, w, h); c.clip();
      const s = Math.max(w / photo.width, h / photo.height); const pw = photo.width * s, ph = photo.height * s;
      c.drawImage(photo, x + (w - pw) / 2, y + (h - ph) / 2, pw, ph); c.restore();
    } else illustrate(c, kind, x, y, w, h, art, ini, f.sans, shape);
  };
  const pill = (text: string, x: number, y: number, dark = false) => {
    c.font = sans(25 * u, 800); const tw = spacedWidth(c, text.toUpperCase(), 4 * u); const pw = tw + 52 * u, ph = 56 * u;
    rrect(c, x, y, pw, ph, ph / 2); c.fillStyle = fullBleed ? "#fff" : dark ? pal.ink : pal.accent; c.fill();
    c.fillStyle = fullBleed ? "#111" : dark ? pal.bg : pal.onAccent; spaced(c, text.toUpperCase(), x + 26 * u, y + 37 * u, 4 * u);
    return { w: pw, h: ph };
  };
  const centerPill = (text: string, y: number) => { c.font = sans(25 * u, 800); const pw = spacedWidth(c, text.toUpperCase(), 4 * u) + 52 * u; return pill(text, (W - pw) / 2, y); };
  const drawLines = (lines: string[], px: number, x: number, yTop: number, lh: number, align: CanvasTextAlign = "left", marker = false) => {
    c.font = head(px); tight(px); c.textAlign = align; let y = yTop + px * 0.82;
    lines.forEach((raw, idx) => {
      const l = (poster ? raw.toUpperCase() : raw).replace(/'/g, "’");
      if (marker && idx % 2 === 1) { const tw = c.measureText(l).width; const bxm = align === "center" ? x - tw / 2 : x; c.fillStyle = pal.accent; rrect(c, bxm - 22 * u, y - px * 0.86, tw + 44 * u, px * 1.0, 14 * u); c.fill(); c.fillStyle = pal.onAccent; } else c.fillStyle = ink;
      c.fillText(l, x, y); y += px * lh;
    });
    c.textAlign = "left"; loose();
  };
  const arrow = (x: number, y: number, size: number, col: string) => { c.save(); c.strokeStyle = col; c.lineWidth = 6 * u; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath(); c.moveTo(x, y); c.lineTo(x + size, y); c.moveTo(x + size - size * 0.35, y - size * 0.3); c.lineTo(x + size, y); c.lineTo(x + size - size * 0.35, y + size * 0.3); c.stroke(); c.restore(); };
  const swipe = (x: number, y: number, align: "left" | "right" = "left") => { c.font = sans(26 * u, 800); c.fillStyle = fullBleed ? "#fff" : pal.ink; const w = spacedWidth(c, "SWIPE", 4 * u); const sx = align === "left" ? x : x - w - 60 * u; spaced(c, "SWIPE", sx, y, 4 * u); arrow(sx + w + 16 * u, y - 9 * u, 38 * u, fullBleed ? "#fff" : pal.ink); };

  // ================================================================ HERO
  if (slide.role === "hero") {
    if (fullBleed) {
      pill(kickerText, m, m);
      const { px, lines } = fit(c, HL, head, boxW, H * 0.32, 168 * u, 60 * u, lhOf, 4);
      drawLines(lines, px, m, contentBottom - lines.length * px * lhOf - (swipeCue ? 70 * u : 0), lhOf);
      if (swipeCue) swipe(m, contentBottom - 12 * u);
    } else if (landscape) {
      pill(kickerText, m, m);
      mediaBox(W * 0.54, m, W - m - W * 0.54, contentBottom - m, lay === "arch" ? "arch" : lay === "badge" ? "circle" : "round");
      const { px, lines } = fit(c, HL, head, W * 0.5 - m, contentBottom - m - 140 * u, 130 * u, 54 * u, lhOf, 4);
      drawLines(lines, px, m, contentBottom - lines.length * px * lhOf, lhOf);
    } else if (lay === "poster") {
      pill(kickerText, m, m);
      const top = m + 56 * u + 40 * u, bottom = H * (format === "story" ? 0.5 : 0.56);
      const { px, lines } = fit(c, HL, head, boxW, bottom - top, 250 * u, 80 * u, lhOf, 4);
      drawLines(lines, px, m, top, lhOf);
      const d = Math.min(W * 0.46, contentBottom - H * 0.6); const cx = W - m - d / 2, cy = contentBottom - d / 2 + 10 * u;
      mediaBox(cx - d / 2, cy - d / 2, d, d, "circle");
      c.strokeStyle = pal.accent; c.lineWidth = 10 * u; c.beginPath(); c.arc(cx, cy, d / 2 + 10 * u, 0, Math.PI * 2); c.stroke();
      if (swipeCue) swipe(m, contentBottom - 12 * u);
    } else if (lay === "stack") {
      pill(kickerText, m, m);
      const top = m + 56 * u + 50 * u, bottom = H * (format === "story" ? 0.48 : 0.55);
      const { px, lines } = fit(c, HL, head, boxW - 44 * u, bottom - top, 170 * u, 64 * u, 1.12, 4);
      drawLines(lines, px, m + 22 * u, top, 1.12, "left", true);
      const my = Math.max(bottom + 30 * u, top + lines.length * px * 1.12 + 40 * u);
      mediaBox(m, my, boxW, contentBottom - my - (swipeCue ? 70 * u : 0), "round");
      if (swipeCue) swipe(m, contentBottom - 12 * u);
    } else if (lay === "arch") {
      const aw = boxW * 0.74, ah = H * (format === "story" ? 0.4 : 0.44), ax = (W - aw) / 2, ay = m + 56 * u + 36 * u;
      centerPill(kickerText, m);
      c.strokeStyle = pal.accent; c.lineWidth = 5 * u; shapePath(c, "arch", ax - 18 * u, ay - 18 * u, aw + 36 * u, ah + 36 * u); c.stroke();
      mediaBox(ax, ay, aw, ah, "arch");
      const top = ay + ah + 56 * u;
      const { px, lines } = fit(c, HL, head, boxW, contentBottom - top - (swipeCue ? 60 * u : 0), 150 * u, 60 * u, lhOf, 3);
      drawLines(lines, px, W / 2, top + (format === "story" ? 10 * u : 0), lhOf, "center");
      if (swipeCue) { c.font = sans(26 * u, 800); const w = spacedWidth(c, "SWIPE", 4 * u) + 60 * u; swipe((W - w) / 2, contentBottom - 12 * u); }
    } else if (lay === "split") {
      const mh = H * 0.52;
      mediaBox(0, 0, W, mh, "sharp");
      if (photo) { const g = c.createLinearGradient(0, 0, 0, mh * 0.3); g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, W, mh * 0.3); if (o.total > 1) { c.fillStyle = "#fff"; c.font = sans(25 * u, 700); spaced(c, `${String(o.index + 1).padStart(2, "0")} / ${String(o.total).padStart(2, "0")}`, W - m, m + 24 * u, 3 * u, "right"); } }
      pill(kickerText, m, mh - 28 * u);
      const top = mh + 56 * u + 36 * u;
      const { px, lines } = fit(c, HL, head, boxW, contentBottom - top - (swipeCue ? 60 * u : 0), 156 * u, 60 * u, lhOf, 4);
      drawLines(lines, px, m, top, lhOf);
      if (swipeCue) swipe(m, contentBottom - 12 * u);
    } else if (lay === "badge") {
      const d = Math.min(boxW * 0.66, H * (format === "story" ? 0.3 : 0.33)); const cx = W / 2, R = d / 2 + 62 * u; const cy = m + 70 * u + R;
      mediaBox(cx - d / 2, cy - d / 2, d, d, "circle");
      c.strokeStyle = pal.accent; c.lineWidth = 12 * u; c.beginPath(); c.arc(cx, cy, d / 2 + 12 * u, 0, Math.PI * 2); c.stroke();
      // text running around the circle
      const unit = (kickerText || "Mila").toUpperCase() + "  •  "; c.font = sans(26 * u, 800); c.fillStyle = ink;
      const circ = 2 * Math.PI * R; const reps = Math.max(1, Math.round(circ / (c.measureText(unit).width + unit.length * 4 * u)));
      const chars = [...unit.repeat(reps)]; const ws = chars.map((ch) => c.measureText(ch).width); const total = ws.reduce((a, b) => a + b, 0); const gap = (circ - total) / chars.length;
      let ang = -Math.PI / 2; chars.forEach((ch, i) => { const aw = (ws[i] + gap) / R; c.save(); c.translate(cx, cy); c.rotate(ang + (ws[i] / 2) / R); c.fillText(ch, -ws[i] / 2, -R); c.restore(); ang += aw; });
      const top = cy + R + 50 * u;
      const { px, lines } = fit(c, HL, head, boxW, contentBottom - top - (swipeCue ? 60 * u : 0), 140 * u, 56 * u, lhOf, 3);
      drawLines(lines, px, W / 2, top, lhOf, "center");
      if (swipeCue) { c.font = sans(26 * u, 800); const w = spacedWidth(c, "SWIPE", 4 * u) + 60 * u; swipe((W - w) / 2, contentBottom - 12 * u); }
    } else if (lay === "ticket") {
      const cx0 = m, cy0 = m + 56 * u + 30 * u, cw = boxW, ch = contentBottom - cy0 - 6 * u;
      rrect(c, cx0, cy0, cw, ch, 44 * u); c.fillStyle = pal.bg2; c.fill();
      const ny = cy0 + ch * 0.6;
      c.fillStyle = pal.bg; c.beginPath(); c.arc(cx0, ny, 38 * u, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(cx0 + cw, ny, 38 * u, 0, Math.PI * 2); c.fill();
      c.strokeStyle = pal.soft; c.globalAlpha = 0.6; c.lineWidth = 4 * u; c.setLineDash([16 * u, 14 * u]); c.beginPath(); c.moveTo(cx0 + 56 * u, ny); c.lineTo(cx0 + cw - 56 * u, ny); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      mediaBox(cx0 + 30 * u, cy0 + 30 * u, cw - 60 * u, ny - cy0 - 30 * u - 46 * u, "round");
      centerPill(kickerText, ny + 40 * u);
      const top = ny + 40 * u + 56 * u + 26 * u;
      const { px, lines } = fit(c, HL, head, cw - 100 * u, cy0 + ch - top - 26 * u, 120 * u, 54 * u, lhOf, 3);
      drawLines(lines, px, W / 2, top, lhOf, "center");
    } else if (lay === "polaroid") {
      const pw = boxW * 0.8, ph = H * (format === "story" ? 0.4 : 0.46), px0 = (W - pw) / 2, py0 = m + 56 * u + 70 * u;
      c.save(); c.translate(W / 2, py0 + ph / 2); c.rotate(-0.045);
      c.shadowColor = "rgba(0,0,0,.28)"; c.shadowBlur = 40 * u; c.shadowOffsetY = 16 * u; rrect(c, -pw / 2, -ph / 2, pw, ph, 14 * u); c.fillStyle = "#fffdf8"; c.fill(); c.shadowColor = "transparent";
      mediaBox(-pw / 2 + 24 * u, -ph / 2 + 24 * u, pw - 48 * u, ph - 130 * u, "sharp");
      c.fillStyle = "#2a2622"; c.font = `400 ${40 * u}px ${f.serif}`; c.textAlign = "center"; c.fillText(kickerText, 0, ph / 2 - 40 * u); c.textAlign = "left";
      c.fillStyle = pal.accent; c.globalAlpha = 0.55; c.fillRect(-90 * u, -ph / 2 - 24 * u, 180 * u, 52 * u); c.globalAlpha = 1;
      c.restore();
      const top = py0 + ph + 80 * u;
      const { px, lines } = fit(c, HL, head, boxW, contentBottom - top - (swipeCue ? 60 * u : 0), 140 * u, 56 * u, lhOf, 3);
      drawLines(lines, px, W / 2, top, lhOf, "center");
      if (swipeCue) { c.font = sans(26 * u, 800); const w = spacedWidth(c, "SWIPE", 4 * u) + 60 * u; swipe((W - w) / 2, contentBottom - 12 * u); }
    } else { // panel (showcase)
      const kk = pill(kickerText, m, m);
      const panelY = m + kk.h + 40 * u, panelH = format === "story" ? H * 0.4 : H * 0.36;
      mediaBox(m, panelY, boxW, panelH, "round");
      const top = panelY + panelH + 54 * u;
      const { px, lines } = fit(c, HL, head, boxW, contentBottom - top - (swipeCue ? 70 * u : 0), 156 * u, 60 * u, lhOf, 4);
      drawLines(lines, px, m, format === "story" ? top + 20 * u : top, lhOf);
      if (swipeCue) swipe(m, contentBottom - 12 * u);
    }
    return cv;
  }

  // ================================================================ HIGHLIGHT
  const ax: CanvasTextAlign = centered ? "center" : "left"; const tx = centered ? W / 2 : m;
  if (slide.role === "highlight") {
    const stats = parseStats(slide.headline);
    if (stats) {
      const cols = landscape ? Math.min(stats.length, 4) : 2; const rows = Math.ceil(stats.length / cols);
      const gap = 28 * u; const cw = (boxW - gap * (cols - 1)) / cols;
      const ch = Math.min(280 * u, (contentBottom - (m + 150 * u) - gap * (rows - 1)) / rows);
      const gridH = rows * ch + (rows - 1) * gap;
      const top = fullBleed ? contentBottom - gridH : m + 130 * u + Math.max(0, (contentBottom - (m + 130 * u) - gridH) / 2);
      if (slide.sub) { c.fillStyle = soft; c.font = sans(32 * u, 700); c.textAlign = ax; c.fillText(slide.sub, tx, top - 38 * u); c.textAlign = "left"; }
      stats.forEach((st, i) => {
        const col = i % cols, row = Math.floor(i / cols); const x = m + col * (cw + gap), y = top + row * (ch + gap);
        rrect(c, x, y, cw, ch, tileR); c.fillStyle = fullBleed ? "rgba(12,12,12,.62)" : i === 0 ? pal.accent : pal.bg2; c.fill();
        const first = i === 0 && !fullBleed; const vcol = first ? pal.onAccent : ink, lcol = first ? pal.onAccent : soft;
        const { px } = fit(c, st.value, head, cw - 64 * u, 150 * u, 132 * u, 52 * u, 1, 1);
        c.fillStyle = vcol; c.font = head(px); tight(px); c.fillText(poster ? st.value.toUpperCase() : st.value, x + 32 * u, y + ch * 0.58); loose();
        c.fillStyle = lcol; c.globalAlpha = first ? 0.8 : 1; c.font = sans(26 * u, 800); spaced(c, st.label.toUpperCase(), x + 32 * u, y + ch * 0.58 + 52 * u, 4 * u); c.globalAlpha = 1;
      });
    } else {
      const n = slide.sub?.match(/^(\d+)\s+of\s+(\d+)/i);
      const badge = 150 * u; let top = m + 20 * u;
      if (n && !fullBleed) {
        const bcx = centered ? W / 2 - 60 * u : m + badge / 2;
        c.beginPath(); c.arc(bcx, top + badge / 2, badge / 2, 0, Math.PI * 2); c.fillStyle = pal.accent; c.fill();
        c.fillStyle = pal.onAccent; c.font = head(96 * u); tight(96 * u); c.textAlign = "center"; c.fillText(n[1], bcx, top + badge / 2 + 34 * u); c.textAlign = "left"; loose();
        c.fillStyle = soft; c.font = sans(26 * u, 800); spaced(c, `OF ${n[2]}`, bcx + badge / 2 + 26 * u, top + badge / 2 + 8 * u, 4 * u);
        top += badge + 56 * u;
      } else if (slide.sub) { const kk = centered ? centerPill(n ? `Tip ${n[1]} of ${n[2]}` : slide.sub, m) : pill(n ? `Tip ${n[1]} of ${n[2]}` : slide.sub, m, m); top = m + kk.h + 56 * u; }
      const panelH = fullBleed || landscape ? 0 : format === "story" ? Math.min(H * 0.3, 540 * u) : Math.min(H * 0.27, 330 * u);
      const textW = !fullBleed && landscape ? W * 0.5 - m : boxW;
      const { px, lines } = fit(c, HL, head, textW, contentBottom - top - panelH - (panelH ? 40 * u : 0), 160 * u, 52 * u, 1.08, 6);
      const free = contentBottom - top - panelH - (panelH ? 40 * u : 0);
      const blockH2 = lines.length * px * 1.08;
      const ty = fullBleed ? contentBottom - blockH2 : format === "story" ? top + Math.max(0, (free - blockH2) / 2) : top;
      drawLines(lines, px, tx, ty, 1.08, ax, lay === "stack");
      if (!fullBleed && !landscape) mediaBox(m, contentBottom - panelH, boxW, panelH, lay === "arch" ? "round" : stripShape);
      if (!fullBleed && landscape) mediaBox(W * 0.54, m, W - m - W * 0.54, contentBottom - m, "round");
    }
    return cv;
  }

  // ================================================================ CALL TO ACTION
  const textW0 = boxW - (landscape ? W * 0.3 : 0);
  const { px, lines } = fit(c, HL, head, textW0, contentBottom - (m + 380 * u), 150 * u, 60 * u, lhOf, 3);
  const blockH = lines.length * px * lhOf;
  const btnH = 84 * u;
  const textTop = contentBottom - btnH - 44 * u - blockH;
  if (!fullBleed && !landscape) { const ay = m + 60 * u; mediaBox(m, ay, boxW, Math.max(220 * u, textTop - 56 * u - ay), lay === "badge" ? "round" : lay === "arch" ? "round" : stripShape); }
  else if (!fullBleed && landscape) mediaBox(W * 0.66, m, W - m - W * 0.66, contentBottom - m, "round");
  drawLines(lines, px, tx, textTop, lhOf, ax, lay === "stack");
  if (slide.sub) {
    c.font = sans(32 * u, 800); const label = slide.sub.length > 44 ? slide.sub.slice(0, 43) + "…" : slide.sub; const tw = Math.min(c.measureText(label).width, boxW - 72 * u); const pw = tw + 72 * u, py = contentBottom - btnH;
    const bxp = centered ? (W - pw) / 2 : m;
    rrect(c, bxp, py, pw, btnH, lay === "poster" || lay === "split" ? 14 * u : btnH / 2); c.fillStyle = fullBleed ? "#fff" : pal.accent; c.fill();
    c.fillStyle = fullBleed ? "#111" : pal.onAccent; c.fillText(label, bxp + 36 * u, py + btnH / 2 + 11 * u, boxW - 72 * u);
  }
  return cv;
}

export const toBlob = (cv: HTMLCanvasElement, type = "image/png") => new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't render the image."))), type));

// ---------------------------------------------------------------- preview cache + queue
const urlCache = new Map<string, string>();
let chain: Promise<unknown> = Promise.resolve();
const slideKey = (s: SocialSlide, o: RenderOpts) => JSON.stringify([s.role, s.headline, s.sub, s.image_url, s.theme, s.layout, o.index, o.total, o.platform, o.brand, o.category, o.width]);

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
