"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/app-context";

/** Only shows when credits are nearly gone (15% or less, or under 25). Dismissible for the session. Never shown on a healthy balance. */
export function LowCreditsBanner() {
  const { credits } = useApp();
  const [hidden, setHidden] = useState(false);
  const low = credits.allowance > 0 && (credits.balance <= credits.allowance * 0.15 || credits.balance < 25);
  if (!low || hidden) return null;
  const out = credits.balance <= 0;
  return (
    <div role="status" className="mx-auto mb-3 flex max-w-3xl items-center gap-3 rounded-3xl px-4 py-3 text-[14.5px]" style={{ background: "color-mix(in srgb, #ffb347 22%, var(--surface-strong, #fff))", color: "var(--ink, #14122b)" }}>
      <span aria-hidden>⚡</span>
      <p className="min-w-0 flex-1"><b>{out ? "You're out of credits." : `Only ${credits.balance.toLocaleString()} credits left.`}</b> {out ? "Add more to keep going." : "Top up any amount, or move to Premium for double."}</p>
      <Link href="/settings/credits" className="btn btn-primary btn-sm">Add credits</Link>
      <button type="button" aria-label="Dismiss" className="faint px-1 text-[18px]" onClick={() => setHidden(true)}>×</button>
    </div>
  );
}
