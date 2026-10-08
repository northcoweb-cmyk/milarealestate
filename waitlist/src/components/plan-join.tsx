"use client";

/** "Join the waitlist" button for the pricing cards: scrolls to the signup form at the top. */
export function PlanJoin({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => {
      document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => document.getElementById("hero-email")?.focus({ preventScroll: true }), 700);
    }}>Join the waitlist</button>
  );
}
