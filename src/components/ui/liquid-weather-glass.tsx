"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * LiquidGlassCard (21st.dev "liquid-weather-glass"), reworked for Mila:
 *  - text stays readable: a sky-aware tint layer sits under the content and content uses the ink colour
 *  - not draggable / no hover-scale unless asked (these are real cards with real buttons inside)
 *  - the SVG displacement ("liquid") filter is defined ONCE (<LiquidGlassDefs/>) and only applied on
 *    desktop Chromium; phones and Safari get the same blur/edge/glow without the costly distortion
 */

type Level = "none" | "xs" | "sm" | "md" | "lg" | "xl";

export interface LiquidGlassCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"> {
  children: React.ReactNode;
  className?: string;
  draggable?: boolean;
  /** Subtle hover/press scale (for tappable cards). */
  interactive?: boolean;
  blurIntensity?: "sm" | "md" | "lg" | "xl";
  shadowIntensity?: Level;
  glowIntensity?: Level;
  borderRadius?: string;
  /** "auto": only on desktop Chromium. */
  distortion?: "auto" | "on" | "off";
  /** Tint strength under the content (keeps text legible on bright skies). */
  tint?: "light" | "regular" | "strong";
}

const blur = { sm: "backdrop-blur-sm", md: "backdrop-blur-md", lg: "backdrop-blur-lg", xl: "backdrop-blur-xl" } as const;

// Edge highlights use Mila's sky-aware --edge-hi / --edge-lo so they don't glare at night.
const edge: Record<Level, string> = {
  none: "inset 0 0 0 0 transparent",
  xs: "inset 1px 1px 1px 0 var(--edge-hi), inset -1px -1px 1px 0 var(--edge-lo)",
  sm: "inset 2px 2px 2px 0 var(--edge-hi), inset -2px -2px 2px 0 var(--edge-lo)",
  md: "inset 3px 3px 3px 0 var(--edge-hi), inset -3px -3px 3px 0 var(--edge-lo)",
  lg: "inset 4px 4px 4px 0 var(--edge-hi), inset -4px -4px 4px 0 var(--edge-lo)",
  xl: "inset 6px 6px 6px 0 var(--edge-hi), inset -6px -6px 6px 0 var(--edge-lo)",
};
const glow: Record<Level, string> = {
  none: "0 4px 4px rgba(0,0,0,.05), 0 0 12px rgba(0,0,0,.05)",
  xs: "0 4px 4px rgba(0,0,0,.12), 0 0 12px rgba(0,0,0,.07), 0 0 16px var(--glow)",
  sm: "0 6px 14px -4px rgba(20,30,80,.22), 0 0 12px rgba(0,0,0,.06), 0 0 24px var(--glow)",
  md: "0 8px 20px -4px rgba(20,30,80,.26), 0 0 12px rgba(0,0,0,.07), 0 0 32px var(--glow)",
  lg: "0 10px 26px -4px rgba(20,30,80,.3), 0 0 12px rgba(0,0,0,.08), 0 0 40px var(--glow)",
  xl: "0 12px 32px -4px rgba(20,30,80,.34), 0 0 12px rgba(0,0,0,.08), 0 0 48px var(--glow)",
};
const tints = { light: "var(--glass)", regular: "var(--glass-strong)", strong: "color-mix(in srgb, var(--glass-strong) 88%, var(--sky-mid))" } as const;

/** Mount once (the app layout does). Defines the liquid displacement filter the cards reference. */
export function LiquidGlassDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute", pointerEvents: "none" }}>
      <defs>
        <filter id="mila-liquid-glass" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.009" numOctaves="1" result="turbulence" />
          <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="26" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

function useDistortion(mode: "auto" | "on" | "off") {
  const [on, setOn] = useState(mode === "on");
  useEffect(() => {
    if (mode !== "auto") { setOn(mode === "on"); return; }
    const ua = navigator.userAgent;
    const chromium = /Chrome\//.test(ua) && !/Edg\/|OPR\/|SamsungBrowser/.test(ua) ? true : /Edg\//.test(ua);
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const calm = !window.matchMedia("(prefers-reduced-motion: reduce)").matches && document.documentElement.dataset.reduceMotion !== "1";
    setOn(chromium && finePointer && calm);
  }, [mode]);
  return on;
}

export const LiquidGlassCard = React.forwardRef<HTMLDivElement, LiquidGlassCardProps>(function LiquidGlassCard(
  { children, className, draggable = false, interactive = false, blurIntensity = "xl", shadowIntensity = "sm", glowIntensity = "sm", borderRadius = "28px", distortion = "auto", tint = "regular", style, ...props },
  ref,
) {
  const distort = useDistortion(distortion);
  const motionProps = draggable || interactive
    ? {
        drag: draggable, dragConstraints: draggable ? { left: 0, right: 0, top: 0, bottom: 0 } : undefined, dragElastic: draggable ? 0.3 : undefined,
        whileHover: interactive ? { scale: 1.01 } : undefined, whileTap: interactive ? { scale: 0.985 } : undefined, whileDrag: draggable ? { scale: 1.02 } : undefined,
      }
    : {};
  const Comp = (draggable || interactive ? motion.div : "div") as React.ElementType;

  return (
    <Comp ref={ref} className={cn("relative text-ink", draggable && "cursor-grab active:cursor-grabbing", className)} style={{ borderRadius, ...style }} {...motionProps} {...props}>
      {/* bend layer: backdrop blur (+ optional liquid distortion) */}
      <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-0", blur[blurIntensity])} style={{ borderRadius, filter: distort ? "url(#mila-liquid-glass)" : undefined }} />
      {/* tint: guarantees legible contrast for the content */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[5]" style={{ borderRadius, background: tints[tint], border: "1px solid var(--glass-border)" }} />
      {/* face: drop shadow + glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ borderRadius, boxShadow: glow[glowIntensity] }} />
      {/* edge: inner highlights */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20" style={{ borderRadius, boxShadow: edge[shadowIntensity] }} />
      <div className="relative z-30">{children}</div>
    </Comp>
  );
});
