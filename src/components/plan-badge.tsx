"use client";

import { useApp } from "@/components/app-context";

export type Tier = "tester" | "trial" | "trial_ended" | "past_due" | "canceled" | "monthly" | "annual" | "team" | "dev";

export function tierOf(c: { status?: string; planKey?: string | null; trial?: { expired: boolean } | null }, tester?: boolean): Tier {
  if (tester) return "tester";
  if (c.status === "trial") return c.trial?.expired ? "trial_ended" : "trial";
  if (c.status === "past_due") return "past_due";
  if (c.status === "canceled") return "canceled";
  if (c.status === "dev") return "dev";
  if (c.planKey === "team") return "team";
  if (c.planKey === "pro_annual") return "annual";
  return "monthly";
}

// each tier has its own color so an upgrade is obvious at a glance
const LOOK: Record<Tier, { label: string; bg: string; fg: string }> = {
  tester: { label: "Tester (no limits)", bg: "#e5e7eb", fg: "#374151" },
  dev: { label: "Development", bg: "#e5e7eb", fg: "#374151" },
  trial: { label: "Free trial", bg: "#dbeafe", fg: "#1d4ed8" },
  trial_ended: { label: "Trial ended: choose a plan", bg: "#fee2e2", fg: "#b91c1c" },
  past_due: { label: "Payment failed", bg: "#fef3c7", fg: "#b45309" },
  canceled: { label: "Canceled", bg: "#fee2e2", fg: "#b91c1c" },
  monthly: { label: "Mila · Monthly", bg: "#ede9fe", fg: "#6d28d9" },
  annual: { label: "Mila · Annual", bg: "#dcfce7", fg: "#15803d" },
  team: { label: "Mila Team", bg: "#fde68a", fg: "#92400e" },
};

/** The plan you are on, in its own color. */
export function PlanBadge({ size = "md" }: { size?: "sm" | "md" }) {
  const { credits, tester } = useApp();
  const t = tierOf(credits, false); // the real plan, even for test accounts, so an upgrade is visible
  const l = tester ? { ...LOOK[t], label: `Tester · ${LOOK[t].label}` } : LOOK[t];
  const days = t === "trial" && credits.trial ? ` · ${credits.trial.daysLeft} day${credits.trial.daysLeft === 1 ? "" : "s"} left` : "";
  return <span data-tier={t} className={size === "sm" ? "text-[12px]" : "text-[13.5px]"} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: l.bg, color: l.fg, fontWeight: 700, borderRadius: 999, padding: size === "sm" ? "3px 10px" : "5px 12px" }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: l.fg }} />{l.label}{days}</span>;
}
