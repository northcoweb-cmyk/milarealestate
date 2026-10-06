"use client";
import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Eased, inertial scrolling for mouse wheels and trackpads. Touch screens keep their own native momentum scrolling
 * (it already feels right there). Off entirely for people who prefer reduced motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true, syncTouch: false, anchors: { offset: -20 } });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);
  return null;
}
