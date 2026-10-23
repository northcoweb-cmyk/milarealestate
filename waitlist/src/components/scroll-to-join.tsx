"use client";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { useLive } from "@/lib/use-live";

export function ScrollToJoin({ text = "Join the waitlist", className }: { text?: string; className?: string }) {
  const live = useLive();
  return (
    <InteractiveHoverButton type="button" text={live ? "Join the queue" : text} className={className} onClick={() => {
      document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => document.getElementById("hero-email")?.focus({ preventScroll: true }), 700);
    }} />
  );
}
