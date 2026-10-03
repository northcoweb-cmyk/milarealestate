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
export const pinTo = (box: { top: number; height: number } | null): React.CSSProperties | undefined => (box ? { top: box.top, height: box.height, bottom: "auto" } : undefined);
