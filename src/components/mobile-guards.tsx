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
    // iPhone (above all the Home Screen app) can leave the page pushed up after the keyboard closes: an empty strip shows at the bottom and taps land in the wrong place,
    // so the login fields look dead. Once no field is focused, put the page back where it belongs, a few times because iOS settles late.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reset = () => {
      const a = document.activeElement as HTMLElement | null;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.min(window.scrollY, max);
      const off = window.visualViewport ? Math.abs(window.visualViewport.offsetTop) : 0;
      if (window.scrollY > max || off > 0.5) { window.scrollTo(0, y + (max > y ? 1 : 0)); requestAnimationFrame(() => window.scrollTo(0, y)); }
    };
    const settle = () => { timers.forEach(clearTimeout); timers.length = 0; for (const ms of [60, 250, 600, 1200]) timers.push(setTimeout(reset, ms)); };
    document.addEventListener("focusout", settle);
    window.visualViewport?.addEventListener("resize", settle);
    try { (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("portrait")?.catch(() => {}); } catch { /* not supported / not allowed outside an installed app */ }
    return () => { document.removeEventListener("gesturestart", stop as EventListener); document.removeEventListener("gesturechange", stop as EventListener); document.removeEventListener("focusout", settle); window.visualViewport?.removeEventListener("resize", settle); timers.forEach(clearTimeout); };
  }, []);
  return null;
}
