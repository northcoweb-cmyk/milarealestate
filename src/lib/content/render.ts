import type { SocialSlide } from "../types";

/**
 * Renders a slide to a 1080x1350 PNG (Instagram 4:5) in the browser, so a finished image can be
 * shared to the phone or downloaded — no server, no image-generation cost.
 */
const W = 1080, H = 1350;
const GRADS: [string, string, string][] = [["#27386b", "#6a7fd1", "#e6a98d"], ["#3a4f8f", "#8a9be0", "#f1c6a8"], ["#5a3f86", "#a07fd8", "#f3b9a0"]];

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/); const lines: string[] = []; let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

export async function renderSlide(slide: SocialSlide, index: number, label?: string): Promise<Blob> {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const [a, b, d] = GRADS[index % 3];
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, a); g.addColorStop(0.6, b); g.addColorStop(1, d);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (slide.image_id) {
    const img = await loadImage(`/api/files/${slide.image_id}`);
    if (img) { const k = Math.max(W / img.width, H / img.height); const w = img.width * k, h = img.height * k; ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); }
  }
  const sc = ctx.createLinearGradient(0, H * 0.35, 0, H); sc.addColorStop(0, "rgba(8,12,40,0)"); sc.addColorStop(1, "rgba(8,12,40,0.78)");
  ctx.fillStyle = sc; ctx.fillRect(0, 0, W, H);

  const sample = document.createElement("span"); sample.className = "display"; document.body.appendChild(sample);
  const serif = getComputedStyle(sample).fontFamily || "Georgia, serif"; sample.remove();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic";
  if (label && slide.role === "hero") { ctx.font = `700 30px ${getComputedStyle(document.body).fontFamily}`; ctx.globalAlpha = 0.85; ctx.fillText(label.toUpperCase().split("").join(String.fromCharCode(8202)), 80, H - 430); ctx.globalAlpha = 1; }
  ctx.font = `400 ${slide.headline.length > 40 ? 84 : 108}px ${serif}`;
  const lines = wrap(ctx, slide.headline, W - 160).slice(0, 5);
  const lh = slide.headline.length > 40 ? 92 : 116;
  let y = H - 150 - (slide.sub ? 70 : 0) - (lines.length - 1) * lh;
  for (const l of lines) { ctx.fillText(l, 80, y); y += lh; }
  if (slide.sub) { ctx.font = `500 42px ${getComputedStyle(document.body).fontFamily}`; ctx.globalAlpha = 0.92; ctx.fillText(slide.sub.slice(0, 60), 80, y + 10); ctx.globalAlpha = 1; }
  return new Promise((res, rej) => c.toBlob((bl) => (bl ? res(bl) : rej(new Error("Couldn't render the image."))), "image/png"));
}

export async function renderAll(slides: SocialSlide[], label?: string): Promise<File[]> {
  const out: File[] = [];
  for (let i = 0; i < slides.length; i++) out.push(new File([await renderSlide(slides[i], i, label)], `post-${i + 1}.png`, { type: "image/png" }));
  return out;
}

/** Share to the phone's share sheet (Instagram, Messages, etc.); falls back to downloading the images. */
export async function shareOrDownload(files: File[], caption: string): Promise<"shared" | "downloaded" | "cancelled"> {
  try { await navigator.clipboard?.writeText(caption); } catch { /* clipboard may be blocked */ }
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (files.length && nav.canShare?.({ files })) {
    try { await navigator.share({ files, text: caption }); return "shared"; }
    catch (e) { if ((e as Error).name === "AbortError") return "cancelled"; }
  }
  for (const f of files) { const url = URL.createObjectURL(f); const a = document.createElement("a"); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
  return "downloaded";
}
