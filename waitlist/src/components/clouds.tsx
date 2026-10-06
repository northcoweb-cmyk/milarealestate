/** Soft clouds drifting across the sky. Pure CSS (no JS), paused for people who prefer reduced motion. */
const CLOUDS = [
  { top: "6%", w: 520, h: 150, op: 0.55, dur: 150, delay: -40, scale: 1 },
  { top: "22%", w: 340, h: 100, op: 0.4, dur: 190, delay: -120, scale: 0.9 },
  { top: "38%", w: 640, h: 180, op: 0.5, dur: 130, delay: -15, scale: 1.1 },
  { top: "58%", w: 420, h: 120, op: 0.35, dur: 210, delay: -170, scale: 0.8 },
  { top: "74%", w: 560, h: 160, op: 0.45, dur: 160, delay: -90, scale: 1 },
  { top: "88%", w: 380, h: 110, op: 0.3, dur: 230, delay: -60, scale: 0.75 },
] as const;

const BODY = [
  "radial-gradient(circle at 18% 66%, #fff 0 22%, transparent 24%)",
  "radial-gradient(circle at 36% 44%, #fff 0 30%, transparent 32%)",
  "radial-gradient(circle at 58% 52%, #fff 0 34%, transparent 36%)",
  "radial-gradient(circle at 78% 64%, #fff 0 24%, transparent 26%)",
  "radial-gradient(ellipse at 50% 78%, #fff 0 46%, transparent 48%)",
].join(",");

export function Clouds({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-0 overflow-hidden ${className}`} aria-hidden>
      {CLOUDS.map((c, i) => (
        <div key={i} className="absolute left-0" style={{ top: c.top, animation: `cloud-drift ${c.dur}s linear ${c.delay}s infinite`, willChange: "transform" }}>
          <div style={{ width: c.w, height: c.h, opacity: c.op * 0.72, backgroundImage: BODY, filter: "blur(10px)", transform: `scale(${c.scale})`, animation: `cloud-bob ${14 + i * 3}s ease-in-out ${-i * 4}s infinite alternate` }} />
        </div>
      ))}
    </div>
  );
}
