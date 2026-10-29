"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = readonly [href: string, label: string];
export const GROUPS: { key: string; label: string; items: readonly Item[] }[] = [
  { key: "overview", label: "Overview", items: [["/", "Overview"], ["/live", "Launch live"]] },
  { key: "inbox", label: "Inbox", items: [["/support", "Support"], ["/feedback", "Feedback"], ["/errors", "Errors"]] },
  { key: "customers", label: "Customers", items: [["/users", "Users"], ["/lapsed", "Lapsed"], ["/funnel", "Funnel"]] },
  { key: "money", label: "Money", items: [["/spend", "AI spend"], ["/launch", "Billing & launch"]] },
  { key: "growth", label: "Growth", items: [["/waitlist", "Waitlist"], ["/invites", "Invites"], ["/creators", "Creators"], ["/social", "Social"]] },
];
export const NAV = GROUPS.flatMap((g) => g.items);

export function Nav({ who }: { who?: "ryan" | "sarah" | null }) {
  const path = usePathname();
  if (who === "sarah") return <nav className="groups" aria-label="Sections">{[["/social", "Social"], ["/creators", "Creators"]].map(([h, l]) => <Link key={h} href={h} className={path === h || path.startsWith(h + "/") ? "on" : ""}>{l}</Link>)}</nav>;
  const active = GROUPS.find((g) => g.items.some(([h]) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/")))) ?? GROUPS[0];
  return (
    <div className="navwrap">
      <nav className="groups" aria-label="Sections">{GROUPS.map((g) => <Link key={g.key} href={g.items[0][0]} className={g.key === active.key ? "on" : ""} aria-current={g.key === active.key ? "page" : undefined}>{g.label}</Link>)}</nav>
      {active.items.length > 1 && <nav className="subs" aria-label={`${active.label} pages`}>{active.items.map(([h, l]) => <Link key={h} href={h} className={path === h || path.startsWith(h + "/") ? "on" : ""}>{l}</Link>)}</nav>}
    </div>
  );
}
