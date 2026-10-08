"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [["/", "Overview"], ["/waitlist", "Waitlist"], ["/users", "Users"], ["/funnel", "Funnel"], ["/errors", "Errors"], ["/feedback", "Feedback"], ["/social", "Social"], ["/spend", "AI spend"], ["/invites", "Invites"], ["/launch", "Launch"]] as const;

export function Nav({ who }: { who?: "ryan" | "sarah" | null }) {
  const path = usePathname();
  return <nav className="nav" aria-label="Sections">{(who === "sarah" ? [["/social", "Social"]] : NAV).map(([href, label]) => <Link key={href} href={href} className={path === href ? "on" : ""}>{label}</Link>)}</nav>;
}
