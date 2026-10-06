"use client";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";

export function ScrollToJoin({ text = "Join the waitlist", className }: { text?: string; className?: string }) {
  return (
    <InteractiveHoverButton type="button" text={text} className={className} onClick={() => {
      document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => document.getElementById("hero-email")?.focus({ preventScroll: true }), 700);
    }} />
  );
}
