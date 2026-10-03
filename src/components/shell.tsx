"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { Building2, CalendarDays, Gauge, Home, Megaphone, Menu, Users } from "lucide-react";
import { useApp } from "./app-context";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" || p.startsWith("/tasks") || p.startsWith("/done") },
  { href: "/contacts", label: "Contacts", icon: Users, match: (p: string) => p.startsWith("/contacts") },
  { href: "/properties", label: "Properties", short: "Homes", icon: Building2, match: (p: string) => p.startsWith("/properties") },
  { href: "/content", label: "Content", icon: Megaphone, match: (p: string) => p.startsWith("/content") },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, match: (p: string) => p.startsWith("/calendar") },
  { href: "/more", label: "More", icon: Menu, match: (p: string) => p.startsWith("/more") || p.startsWith("/settings") || p.startsWith("/memory") || p.startsWith("/templates") || p.startsWith("/documents") || p.startsWith("/workflows") || p.startsWith("/admin") || p.startsWith("/showings") },
];

/** Which way the new screen should arrive from: sideways between tabs, forward/back inside a tab. */
function direction(prev: string, cur: string): "fade" | "right" | "left" | "push" | "pop" {
  if (prev === cur) return "fade";
  const a = NAV.findIndex((n) => n.match(prev)), b = NAV.findIndex((n) => n.match(cur));
  if (a !== b) return b > a ? "right" : "left";
  return cur.split("/").length >= prev.split("/").length ? "push" : "pop";
}

export function Shell({ children, approvals }: { children: React.ReactNode; approvals: number }) {
  const path = usePathname();
  const { admin } = useApp();
  useEffect(() => { window.scrollTo(0, 0); }, [path]);
  const [nav, setNav] = useState({ path, prev: path });
  if (nav.path !== path) setNav({ path, prev: nav.path }); // remember where we came from (set during render, per React docs)
  const dir = direction(nav.prev, nav.path);
  // Highlight the tapped tab immediately instead of waiting for the next screen to arrive.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const shown = tapped && tapped.from === path ? tapped.href : path;
  // The highlight is only a preview of where the tap is going. Drop it once the page actually changes (otherwise coming back to the
  // page you tapped from re-highlights the old tab), when the touch is cancelled, and if the navigation never happens.
  useEffect(() => { setTapped(null); }, [path]);
  useEffect(() => {
    if (!tapped) return;
    const t = setTimeout(() => setTapped(null), 1600);
    return () => clearTimeout(t);
  }, [tapped]);
  return (
    <>
      {/* desktop rail */}
      <nav aria-label="Primary" className="glass fixed bottom-5 left-5 top-5 z-40 hidden w-[92px] flex-col items-center py-6 lg:flex" style={{ borderRadius: 32 }}>
        <Link href="/" className="display mb-8 text-[30px]" aria-label="Mila home">M</Link>
        <div className="flex flex-1 flex-col gap-2">
          {NAV.map((n) => {
            const active = n.match(shown);
            return (
              <Link key={n.href} href={n.href} onPointerDown={() => setTapped({ href: n.href, from: path })} onPointerCancel={() => setTapped(null)} aria-current={active ? "page" : undefined} className={clsx("relative flex w-[68px] flex-col items-center gap-1 rounded-2xl py-3 text-[11.5px] font-semibold transition-colors", active ? "" : "text-ink-soft hover:bg-white/30")} style={active ? { color: "var(--accent-ink)" } : undefined}>
                {active && <motion.span layoutId="rail-pill" className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-2))" }} transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
                <n.icon size={22} strokeWidth={active ? 2.3 : 1.9} className="relative" />
                <span className="relative">{n.label}</span>
                {n.href === "/" && approvals > 0 && <span className="absolute right-2 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10.5px] font-bold text-white">{approvals}</span>}
              </Link>
            );
          })}
        </div>
        {admin && <Link href="/admin" aria-label="Owner dashboard" title="Owner dashboard" className={clsx("flex h-11 w-11 items-center justify-center rounded-2xl transition", path.startsWith("/admin") ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "muted hover:bg-[var(--line)]")}><Gauge size={20} /></Link>}
      </nav>

      {/* Never let the document get shorter than the screen while a page loads: on iPhone, Safari re-shows its toolbar when the page stops scrolling, which makes the tab bar jump. */}
      <div className="overflow-x-clip lg:pl-[128px]" style={{ minHeight: "calc(100lvh + 2px)" }}><div key={path} className={"page-in page-in-" + dir}>{children}</div></div>

      {/* mobile tab bar */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),12px)] lg:hidden" style={{ transform: "translate3d(0,0,0)", willChange: "transform", contain: "layout paint" }}>
        <div className="surface mx-auto flex max-w-md items-center justify-between p-1.5" style={{ borderRadius: 999, background: "color-mix(in srgb, var(--surface) 94%, transparent)" }}>
          {NAV.map((n) => {
            const active = n.match(shown);
            return (
              <Link key={n.href} href={n.href} scroll={false} onPointerDown={() => setTapped({ href: n.href, from: path })} onPointerCancel={() => setTapped(null)} aria-current={active ? "page" : undefined} className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-0.5 py-2 text-[10px] font-semibold tracking-tight transition-colors" style={{ color: active ? "var(--accent-ink)" : "var(--ink-soft)" }}>
                {active && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-2))" }} transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
                <n.icon size={21} strokeWidth={active ? 2.3 : 1.9} className="relative" />
                <span className="relative">{"short" in n && n.short ? <><span className="min-[380px]:hidden">{n.short}</span><span className="hidden min-[380px]:inline">{n.label}</span></> : n.label}</span>
                {n.href === "/" && approvals > 0 && <span className="absolute right-[22%] top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">{approvals}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
