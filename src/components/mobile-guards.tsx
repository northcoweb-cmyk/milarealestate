"use client";

import { useEffect } from "react";

/**
 * Phone behaviour: no pinch zoom (iOS ignores the viewport tag for pinch, so the gesture itself is cancelled; double-tap zoom is switched off by `touch-action` in globals.css, which never swallows a real tap),
 * and keep portrait where the browser lets us (installed Android app; iOS honours only the CSS cover in globals.css).
 */
export function MobileGuards() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop as EventListener, { passive: false });
    document.addEventListener("gesturechange", stop as EventListener, { passive: false });
    const pinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener("touchmove", pinch, { passive: false });
    // iPhone can leave the page pushed up after the keyboard closes, showing an empty strip at the bottom: once no field is focused, clamp the scroll back inside the page
    let t: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const a = document.activeElement as HTMLElement | null;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        if (window.scrollY > max) window.scrollTo(0, max);
        else if (window.scrollY > 0 && max === 0) window.scrollTo(0, 0);
      }, 250);
    };
    document.addEventListener("focusout", settle);
    try { (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("portrait")?.catch(() => {}); } catch { /* not supported / not allowed outside an installed app */ }
    return () => { document.removeEventListener("gesturestart", stop as EventListener); document.removeEventListener("gesturechange", stop as EventListener); document.removeEventListener("touchmove", pinch); document.removeEventListener("focusout", settle); clearTimeout(t); };
  }, []);
  return null;
}
