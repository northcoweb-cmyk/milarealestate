"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Menu, Users } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" || p.startsWith("/tasks") },
  { href: "/contacts", label: "Contacts", icon: Users, match: (p: string) => p.startsWith("/contacts") },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, match: (p: string) => p.startsWith("/calendar") },
  { href: "/more", label: "More", icon: Menu, match: (p: string) => p.startsWith("/more") || p.startsWith("/settings") || p.startsWith("/memory") || p.startsWith("/templates") || p.startsWith("/documents") || p.startsWith("/workflows") || p.startsWith("/admin") || p.startsWith("/properties") },
];

export function Shell({ children, approvals }: { children: React.ReactNode; approvals: number }) {
  const path = usePathname();
  return (
    <>
      {/* desktop rail */}
      <nav aria-label="Primary" className="glass fixed bottom-5 left-5 top-5 z-40 hidden w-[92px] flex-col items-center py-6 lg:flex" style={{ borderRadius: 32 }}>
        <Link href="/" className="display mb-8 text-[30px]" aria-label="Mila home">M</Link>
        <div className="flex flex-1 flex-col gap-2">
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={clsx("relative flex w-[68px] flex-col items-center gap-1 rounded-2xl py-3 text-[11.5px] font-semibold transition", active ? "text-white" : "text-ink-soft hover:bg-white/30")} style={active ? { background: "linear-gradient(135deg,var(--accent),var(--accent-2))", color: "var(--accent-ink)" } : undefined}>
                <n.icon size={22} strokeWidth={active ? 2.3 : 1.9} />
                {n.label}
                {n.href === "/" && approvals > 0 && <span className="absolute right-2 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10.5px] font-bold text-white">{approvals}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="lg:pl-[128px]">{children}</div>

      {/* mobile tab bar */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),12px)] lg:hidden">
        <div className="glass-strong mx-auto flex max-w-md items-center justify-between p-1.5" style={{ borderRadius: 999 }}>
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[11px] font-semibold transition" style={active ? { background: "linear-gradient(135deg,var(--accent),var(--accent-2))", color: "var(--accent-ink)" } : { color: "var(--ink-soft)" }}>
                <n.icon size={21} strokeWidth={active ? 2.3 : 1.9} />
                {n.label}
                {n.href === "/" && approvals > 0 && <span className="absolute right-[22%] top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">{approvals}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
