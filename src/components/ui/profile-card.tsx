"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Clock, CreditCard, UserRound, Zap } from "lucide-react";
import { Avatar } from "@/components/ui";
import { useApp } from "@/components/app-context";
import { tierOf, type Tier } from "@/components/plan-badge";

/** The plan strip under the card: each plan has its own colors, so an upgrade is obvious at a glance. */
const LOOK: Record<Tier, { strip: string; ink: string; dot: string; status: string }> = {
  trial: { strip: "linear-gradient(90deg,#8fb4ff,#b9a8ff)", ink: "#14123a", dot: "#8fb4ff", status: "Free trial" },
  trial_ended: { strip: "linear-gradient(90deg,#ff9a8f,#ffc9a8)", ink: "#4a1410", dot: "#ff7a7a", status: "Trial ended" },
  monthly: { strip: "linear-gradient(90deg,#b79cff,#8fb4ff)", ink: "#14123a", dot: "#58e0a0", status: "Active" },
  annual: { strip: "linear-gradient(90deg,#7be0b0,#8fe3d0)", ink: "#0b3a2a", dot: "#58e0a0", status: "Active · Annual" },
  team: { strip: "linear-gradient(90deg,#ffd37a,#ffb36b)", ink: "#4a2a05", dot: "#58e0a0", status: "Active · Team" },
  past_due: { strip: "linear-gradient(90deg,#ffe08f,#ffc27a)", ink: "#4a3205", dot: "#ffb347", status: "Payment failed" },
  canceled: { strip: "linear-gradient(90deg,#ff9a8f,#ffc9a8)", ink: "#4a1410", dot: "#ff7a7a", status: "Canceled" },
  tester: { strip: "linear-gradient(90deg,#d9d4ff,#eceaff)", ink: "#14123a", dot: "#b9b2ff", status: "Tester" },
  dev: { strip: "linear-gradient(90deg,#d9d4ff,#eceaff)", ink: "#14123a", dot: "#b9b2ff", status: "Development" },
};

export function ProfileCard({ className = "" }: { className?: string }) {
  const { profile, credits } = useApp();
  const tier = tierOf(credits, false);
  const look = LOOK[tier];
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, hour: "numeric", minute: "2-digit" }).format(new Date()));
    tick(); const id = setInterval(tick, 30_000); return () => clearInterval(id);
  }, [profile.timezone]);
  const plan = credits.planName ?? (tier === "trial" || tier === "trial_ended" ? "Free trial" : "Mila");
  const detail = tier === "trial" && credits.trial ? `Day ${credits.trial.day} of 7 · ${credits.trial.daysLeft} ${credits.trial.daysLeft === 1 ? "day" : "days"} left` : tier === "trial_ended" ? "Choose a plan to keep going" : `${credits.balance.toLocaleString()} credits left`;
  const role = [profile.role, profile.brokerage].filter(Boolean).join(" · ") || "Real estate";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className={`mx-auto w-full max-w-md ${className}`}>
      {/* one piece: the plan color is the back of the whole card, and the card sits on top of it so the strip shows below and in the bottom corners */}
      <div className="relative rounded-[28px] pb-10" style={{ background: look.strip, boxShadow: "0 28px 60px -22px rgba(120,100,230,.8)" }}>
        <Link href="/settings/credits" aria-label="Plan and billing" className="absolute inset-x-0 bottom-0 z-0 flex h-10 items-center justify-center text-[13px] font-bold transition hover:brightness-105" style={{ color: look.ink }}>
          <span className="inline-flex items-center gap-1.5"><Zap size={14} aria-hidden />{plan} · {detail}</span>
        </Link>
        <div className="relative z-10 rounded-[28px] p-5 text-white" style={{ background: "radial-gradient(120% 120% at 30% 10%,#26206b 0%,#161247 60%,#0f0c36 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.1)" }}>
        <div className="mb-4 flex items-center justify-between text-[13px] text-white/70">
          <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: look.dot }} />{look.status}</span>
          <span className="flex items-center gap-1.5 tabular-nums opacity-80"><Clock size={14} aria-hidden />{time}</span>
        </div>
        <Link href="/settings/profile" aria-label="Edit your profile" className="flex items-center gap-4">
          <Avatar name={profile.full_name} size={52} src={profile.settings.brand?.pfp ? `/api/files/${profile.settings.brand.pfp}` : null} ring="rgba(255,255,255,.14)" />
          <div className="min-w-0 text-left"><p className="truncate text-[19px] font-semibold tracking-tight">{profile.full_name}</p><p className="truncate text-[13.5px] text-white/60">{role}</p></div>
        </Link>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Link href="/settings/credits" className="flex h-11 items-center justify-start gap-2.5 rounded-2xl bg-white/10 px-3.5 text-[14px] font-semibold transition hover:bg-white/15"><CreditCard size={16} aria-hidden />Billing</Link>
          <Link href="/settings/profile" className="flex h-11 items-center justify-start gap-2.5 rounded-2xl bg-white/10 px-3.5 text-[14px] font-semibold transition hover:bg-white/15"><UserRound size={16} aria-hidden />Profile</Link>
        </div>
        </div>
      </div>
    </motion.div>
  );
}
