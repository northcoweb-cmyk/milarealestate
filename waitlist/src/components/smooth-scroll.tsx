"use client";
import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Eased, inertial scrolling for mouse wheels, trackpads and touch screens (set syncTouch to false to hand phones back
 * to native momentum scrolling). Off entirely for people who prefer reduced motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true, syncTouch: true, syncTouchLerp: 0.09, anchors: { offset: -20 } });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);
  return null;
}
