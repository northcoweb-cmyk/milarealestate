"use client";
import { useRef } from "react";
import { m, useScroll, useTransform } from "framer-motion";

/** The hero text drifts up as you scroll past it. Transform and opacity only, so it stays on the graphics chip. */
export function HeroParallax({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 40]);
  return <m.div ref={ref} style={{ y, willChange: "transform" }} className={className}>{children}</m.div>;
}
