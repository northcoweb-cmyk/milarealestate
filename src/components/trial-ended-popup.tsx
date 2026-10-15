"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "./app-context";

const KEY = "mila_trial_popup";

/** Once a free trial is over, every new visit (each time you sign in or reopen the app) opens with this, pointing straight at the plans. Data stays visible; "Not now" closes it for this visit. */
export function TrialEndedPopup() {
  const { credits, tester } = useApp();
  const path = usePathname();
  const ended = !tester && credits.status === "trial" && !!credits.trial?.expired;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ended || path.startsWith("/settings/credits")) return;
    let seen = false; try { seen = sessionStorage.getItem(KEY) === "1"; } catch { /* private mode: show it */ }
    if (!seen) setOpen(true);
  }, [ended, path]);
  if (!open) return null;
  const close = () => { try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ } setOpen(false); };
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="trial-ended-title" style={{ background: "rgba(8,6,30,.55)", backdropFilter: "blur(6px)" }}>
      <div className="glass-strong w-full max-w-md p-7 text-center" style={{ borderRadius: 32 }}>
        <p className="text-[40px]" aria-hidden>⏳</p>
        <h2 id="trial-ended-title" className="h2 mt-1">Your free trial has ended</h2>
        <p className="muted mt-2 text-[15.5px] leading-snug">Everything you added is safe and still here to look at. Choose a plan to pick up where you left off and have Mila working for you again.</p>
        <Link href="/settings/credits" onClick={close} className="btn btn-primary mt-6 w-full">Choose a plan</Link>
        <button type="button" onClick={close} className="btn btn-quiet mt-2 w-full">Not now</button>
      </div>
    </div>
  );
}
