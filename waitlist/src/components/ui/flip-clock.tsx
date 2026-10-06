"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Digit = ({ value }: { value: number }) => (
  <div className="relative flex h-14 w-9 items-center justify-center overflow-hidden rounded-lg bg-zinc-900/90 font-mono text-3xl font-bold text-white shadow-lg ring-1 ring-white/10 sm:h-16 sm:w-11 sm:text-4xl">
    <AnimatePresence mode="popLayout">
      <motion.span key={value} initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.3 }} className="absolute inset-0 flex items-center justify-center">{value}</motion.span>
    </AnimatePresence>
    <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/60" aria-hidden />
  </div>
);

function Group({ label, value, pad = 2 }: { label: string; value: number; pad?: number }) {
  const s = String(Math.max(0, value)).padStart(pad, "0");
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-1">{s.split("").map((d, i) => <Digit key={`${label}-${i}`} value={parseInt(d)} />)}</div>
      <span className="text-[11px] font-semibold uppercase tracking-[.18em] text-white/85">{label}</span>
    </div>
  );
}

/** Countdown to the launch moment. Renders zeros on the server and starts ticking on the client, so there is no hydration mismatch. */
export default function FlipClock({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const left = now === null ? 0 : Math.max(0, target - now);
  const d = Math.floor(left / 86_400_000), h = Math.floor(left / 3_600_000) % 24, m = Math.floor(left / 60_000) % 60, s = Math.floor(left / 1000) % 60;
  const launched = now !== null && left === 0;
  return (
    <div className="flex flex-col items-center gap-3" role="timer" aria-label={launched ? "Mila has launched" : `${d} days ${h} hours ${m} minutes until launch`}>
      {launched ? <p className="display text-4xl text-white">We&apos;re live.</p> : (
        <div className="flex items-start justify-center gap-2 sm:gap-4">
          <Group label="Days" value={d} /><span className="pt-3 text-2xl font-bold text-white/60">:</span>
          <Group label="Hours" value={h} /><span className="pt-3 text-2xl font-bold text-white/60">:</span>
          <Group label="Min" value={m} /><span className="pt-3 text-2xl font-bold text-white/60">:</span>
          <Group label="Sec" value={s} />
        </div>
      )}
    </div>
  );
}
