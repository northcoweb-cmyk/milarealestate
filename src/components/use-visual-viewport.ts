"use client";

import { useEffect, useState } from "react";

/**
 * The part of the screen that is actually visible. On iPhone, opening the keyboard doesn't resize the page — Safari scrolls it up
 * instead — so a bottom sheet pinned to the page slides out of view and looks like it "closed". Pinning to this box keeps the sheet,
 * and the text field in it, on screen while you type.
 */
export function useVisualViewport(active: boolean) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) { setBox(null); return; }
    const read = () => setBox((b) => (b && Math.abs(b.top - vv.offsetTop) < 0.5 && Math.abs(b.height - vv.height) < 0.5 ? b : { top: vv.offsetTop, height: vv.height }));
    read();
    vv.addEventListener("resize", read); vv.addEventListener("scroll", read);
    return () => { vv.removeEventListener("resize", read); vv.removeEventListener("scroll", read); };
  }, [active]);
  return box;
}

/** Inline style that pins a `fixed inset-0` overlay to the visible area (no-op where there is no visual viewport). */
export const pinTo = (box: { top: number; height: number } | null): React.CSSProperties | undefined =>
  // Only while the keyboard is up. Otherwise the overlay fills the whole screen (`inset-0`): pinning to the "visible area" at rest left a
  // blank strip under sheets on iPhone (the home-indicator / toolbar zone is outside that box).
  // The height eases as the keyboard slides in/out (iOS keyboard ≈ 250ms); `top` follows the page pan instantly so nothing lags.
  (box && typeof window !== "undefined" && window.innerHeight - box.height > 120 ? { top: box.top, height: box.height, bottom: "auto", transition: "height .26s cubic-bezier(.2,.8,.2,1)" } : undefined);

/** True while the on-screen keyboard is up (the visible area is much shorter than the window). */
export const keyboardUp = (box: { top: number; height: number } | null) => !!box && typeof window !== "undefined" && window.innerHeight - box.height > 120;
