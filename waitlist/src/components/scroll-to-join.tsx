"use client";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { APP_URL, useLive } from "@/lib/use-live";

export function ScrollToJoin({ text = "Join the waitlist", className }: { text?: string; className?: string }) {
  const live = useLive();
  return (
    <InteractiveHoverButton type="button" text={live ? "Start your free trial" : text} className={className} onClick={() => {
      if (live) { window.location.href = APP_URL; return; }
      document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => document.getElementById("hero-email")?.focus({ preventScroll: true }), 700);
    }} />
  );
}
