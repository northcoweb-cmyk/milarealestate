"use client";

import { useEffect } from "react";

/**
 * Freezes the page behind a sheet or the chat. `overflow: hidden` alone isn't enough on iPhone — the page still scrolls under your finger —
 * so the body is pinned in place (and put back at the exact scroll position afterwards). Counts nested locks (a confirm on top of a sheet).
 */
let locks = 0;
let saved: { y: number; style: Partial<CSSStyleDeclaration> } | null = null;
const PROPS = ["position", "top", "left", "right", "width", "overflow"] as const;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const b = document.body;
    if (locks++ === 0) {
      const y = window.scrollY;
      saved = { y, style: Object.fromEntries(PROPS.map((p) => [p, b.style[p]])) };
      b.style.position = "fixed"; b.style.top = `-${y}px`; b.style.left = "0"; b.style.right = "0"; b.style.width = "100%"; b.style.overflow = "hidden";
    }
    return () => {
      if (--locks === 0 && saved) {
        const { y, style } = saved; saved = null;
        for (const p of PROPS) b.style[p] = (style[p] as string) ?? "";
        window.scrollTo(0, y);
      }
    };
  }, [active]);
}
