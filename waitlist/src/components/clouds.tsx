/**
 * Soft clouds drifting across the sky. Each cloud is a small pre-blurred image that only moves with transform,
 * so the browser animates it on the graphics chip without repainting anything (cheap on phones).
 */
const CLOUDS = [
  { img: 1, top: "5%", w: 520, op: 0.7, dur: 150, delay: -40 },
  { img: 2, top: "30%", w: 340, op: 0.5, dur: 190, delay: -120 },
  { img: 3, top: "52%", w: 640, op: 0.6, dur: 130, delay: -15 },
  { img: 1, top: "80%", w: 420, op: 0.45, dur: 170, delay: -90 },
] as const;

export function Clouds({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-0 overflow-hidden ${className}`} aria-hidden>
      {CLOUDS.map((c, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={`/clouds/c${c.img}.webp`} alt="" width={c.w} height={Math.round(c.w * 0.516)} decoding="async" loading="lazy" draggable={false}
          className="absolute left-0 max-w-none select-none" style={{ top: c.top, width: c.w, opacity: c.op, animation: `cloud-drift ${c.dur}s linear ${c.delay}s infinite`, willChange: "transform" }} />
      ))}
    </div>
  );
}
