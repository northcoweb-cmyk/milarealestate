"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

const ROOTS = new Set(["/", "/contacts", "/properties", "/content", "/calendar", "/more"]);
let inAppNavs = 0; // how many screens the person has moved through inside Mila this visit (0 = they landed straight on this one)
let lastPath: string | null = null;

/** Mount once (in the shell): counts in-app navigation so Back can go to where you really came from. */
export function NavTracker() {
  const path = usePathname();
  useEffect(() => { if (lastPath !== null && lastPath !== path) inAppNavs++; lastPath = path; }, [path]);
  return null;
}

/** Where Back goes when there's nothing to go back to (opened from a link or a refresh). */
function parentOf(path: string): string {
  if (/^\/showings\/[^/]+/.test(path)) return "/showings";
  const root = "/" + (path.split("/")[1] ?? "");
  if (["/contacts", "/properties", "/content", "/calendar"].includes(root)) return root;
  if (root === "/tasks" || root === "/done") return "/";
  return "/more";
}

/** A Back pill shown at the top of every screen that isn't one of the six main tabs. */
export function BackButton() {
  const path = usePathname();
  const router = useRouter();
  if (ROOTS.has(path)) return null;
  return (
    <button type="button" aria-label="Go back" onClick={() => (inAppNavs > 0 ? router.back() : router.push(parentOf(path)))}
      className="glass mb-4 inline-flex min-h-[40px] items-center gap-1 rounded-full py-1.5 pl-2.5 pr-4 text-[14.5px] font-semibold transition active:scale-95 hover:brightness-110"
      style={{ borderRadius: 999, boxShadow: "0 6px 18px -10px rgba(0,0,0,.45)" }}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-2))", color: "var(--accent-ink)" }}><ChevronLeft size={16} strokeWidth={2.6} /></span>
      Back
    </button>
  );
}
