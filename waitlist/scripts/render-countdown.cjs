// Renders the countdown hero images used in the launch email (public/email/countdown-N.jpg, N = days left).
// Run: NODE_PATH=<folder with playwright-core> node scripts/render-countdown.cjs   (any Chromium works; set CHROME to its path if needed)
const fs = require("fs"), path = require("path");
let pw; try { pw = require("playwright-core"); } catch { pw = require("/opt/node-tools/node_modules/playwright-core"); }
const OUT = path.join(__dirname, "..", "public", "email");
const MAX = 14, W = 560, H = 440;

const stars = (() => { let s = 7, r = () => (s = (s * 9301 + 49297) % 233280) / 233280, out = ""; for (let i = 0; i < 90; i++) { const x = r() * W, y = r() * H * 0.8, z = r() < 0.12 ? 2.2 : r() < 0.4 ? 1.4 : 0.9; out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${z}" fill="#fff" opacity="${(0.25 + r() * 0.7).toFixed(2)}"/>`; } return out; })();

const page = (n) => {
  const cx = W / 2, cy = 206, R = 112, C = 2 * Math.PI * R, frac = Math.min(1, Math.max(0.04, (MAX - n) / MAX));
  const ticks = Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * 2 * Math.PI - Math.PI / 2, r1 = R + 14, r2 = R + (i % 5 === 0 ? 24 : 19); return `<line x1="${(cx + r1 * Math.cos(a)).toFixed(1)}" y1="${(cy + r1 * Math.sin(a)).toFixed(1)}" x2="${(cx + r2 * Math.cos(a)).toFixed(1)}" y2="${(cy + r2 * Math.sin(a)).toFixed(1)}" stroke="#fff" stroke-opacity="${i % 5 === 0 ? 0.55 : 0.22}" stroke-width="${i % 5 === 0 ? 1.8 : 1}"/>`; }).join("");
  const label = n === 0 ? "IT'S LAUNCH DAY" : n === 1 ? "DAY TO GO" : "DAYS TO GO";
  const big = n === 0 ? "Today" : String(n);
  const size = n === 0 ? 62 : n >= 10 ? 104 : 128;
  return `<!doctype html><html><body style="margin:0;background:#120f3a">
<div style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:radial-gradient(120% 90% at 50% 0%,#4b3bb8 0%,#2a2178 42%,#15123f 100%);font-family:Georgia,'Times New Roman',serif">
<svg width="${W}" height="${H}" style="position:absolute;inset:0">
<defs>
<linearGradient id="arc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fb4ff"/><stop offset=".55" stop-color="#c7a8ff"/><stop offset="1" stop-color="#ffc9a8"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#a68cff" stop-opacity=".55"/><stop offset="1" stop-color="#a68cff" stop-opacity="0"/></radialGradient>
<radialGradient id="moon" cx=".4" cy=".35"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9d4ff"/></radialGradient>
<filter id="b6" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter><filter id="b14" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
${stars}
<circle cx="${W - 58}" cy="52" r="46" fill="#bfb4ff" opacity=".35" filter="url(#b14)"/><circle cx="${W - 58}" cy="52" r="20" fill="url(#moon)"/>
<circle cx="${cx}" cy="${cy}" r="${R + 70}" fill="url(#glow)"/>
${ticks}
<circle cx="${cx}" cy="${cy}" r="${R}" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.16)" stroke-width="2"/>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="url(#arc)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" filter="url(#b6)" opacity=".7"/>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="url(#arc)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>
<ellipse cx="${cx - 150}" cy="${H + 14}" rx="190" ry="62" fill="#ffd9c4" opacity=".22" filter="url(#b14)"/><ellipse cx="${cx + 160}" cy="${H + 20}" rx="210" ry="70" fill="#b7a6ff" opacity=".35" filter="url(#b14)"/><ellipse cx="${cx}" cy="${H + 30}" rx="260" ry="60" fill="#fff" opacity=".12" filter="url(#b14)"/>
</svg>
<div style="position:absolute;top:22px;left:0;right:0;text-align:center;color:#fff;font-size:24px;letter-spacing:.02em">Mila</div>
<div style="position:absolute;left:0;right:0;top:${cy - size * 0.58}px;text-align:center;color:#fff;font-size:${size}px;line-height:1;text-shadow:0 0 38px rgba(166,140,255,.95),0 0 90px rgba(143,180,255,.55);font-weight:400">${big}</div>
<div style="position:absolute;left:0;right:0;top:${cy + 56}px;text-align:center;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:.32em;font-weight:700;color:#d9d4ff">${label}</div>
<div style="position:absolute;left:0;right:0;bottom:30px;text-align:center"><span style="display:inline-block;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13.5px;font-weight:700;letter-spacing:.16em;color:#1a1650;background:linear-gradient(90deg,#c9dcff,#e6d9ff,#ffe0cf);padding:11px 22px;border-radius:999px;box-shadow:0 10px 30px -8px rgba(166,140,255,.8)">TUESDAY · OCT 20 · 10 AM ET</span></div>
</div></body></html>`;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await pw.chromium.launch({ args: ["--no-sandbox"], ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  for (let n = 0; n <= MAX; n++) { await p.setContent(page(n)); await p.waitForTimeout(120); await p.screenshot({ path: path.join(OUT, `countdown-${n}.jpg`), type: "jpeg", quality: 84, clip: { x: 0, y: 0, width: W, height: H } }); }
  await b.close();
  console.log("done");
})();
