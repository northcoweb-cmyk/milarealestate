"use client";
import { LazyMotion } from "framer-motion";

// Animation features load after the page is interactive, so the first paint is not held up by them.
const loadFeatures = () => import("./motion-features").then((m) => m.default);
export function MotionProvider({ children }: { children: React.ReactNode }) { return <LazyMotion features={loadFeatures} strict>{children}</LazyMotion>; }
