"use client";

import { type RefObject, useEffect } from "react";
import { animate, type MotionValue } from "motion/react";

/**
 * Swipe down to dismiss a sheet. Works from anywhere on the panel as long as its content is scrolled to the top, so scrolling long
 * content still scrolls and a pull-down closes it. Horizontal swipes (photo carousels) and text fields are left alone. The X keeps working.
 */
export function useSwipeDismiss(ref: RefObject<HTMLElement | null>, y: MotionValue<number>, active: boolean, onClose: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    let d: { x: number; y: number; on: boolean; v: number; ly: number; lt: number } | null = null;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || (e.target as HTMLElement).closest("textarea, input, select, [data-no-swipe]")) { d = null; return; }
      d = { x: t.clientX, y: t.clientY, on: false, v: 0, ly: t.clientY, lt: performance.now() };
    };
    const move = (e: TouchEvent) => {
      if (!d) return;
      const t = e.touches[0], dy = t.clientY - d.y, dx = t.clientX - d.x;
      if (!d.on) {
        if (el.scrollTop > 0 || dy < -6) { d = null; return; }              // it's a normal scroll (or an upward swipe)
        if (dy > 12 && dy > Math.abs(dx) * 1.5) { d.on = true; y.stop(); }  // a deliberate pull down
        else return;
      }
      e.preventDefault();
      const now = performance.now();
      d.v = (t.clientY - d.ly) / Math.max(now - d.lt, 1); d.ly = t.clientY; d.lt = now;
      y.set(Math.max(0, dy * 0.92));
    };
    const end = () => {
      const s = d; d = null;
      if (!s?.on) return;
      if (y.get() > 110 || s.v > 0.8) onClose(); else animate(y, 0, { type: "spring", damping: 28, stiffness: 340 });
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end); el.addEventListener("touchcancel", end);
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end); };
  }, [ref, y, active, onClose]);
}
