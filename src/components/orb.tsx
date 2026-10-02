export function Orb({ size = 34 }: { size?: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden>
      <span className="absolute inset-0 rounded-full opacity-60 blur-md" style={{ background: "conic-gradient(from 0deg, var(--accent), var(--accent-2), #8a8a8e, var(--accent))", animation: "orb 5s linear infinite" }} />
      <span className="absolute inset-[3px] rounded-full" style={{ background: "conic-gradient(from 90deg, var(--accent), var(--accent-2), #bdbdc0, var(--accent))", animation: "orb 3.2s linear infinite" }} />
      <span className="absolute inset-[8px] rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #fff, rgba(255,255,255,.35))" }} />
    </span>
  );
}
